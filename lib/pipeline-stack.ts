import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface PipelineStackProps extends cdk.StackProps {
  environment: string;
  githubConnectionArn?: string; // Optional: GitHub connection ARN
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { environment, githubConnectionArn } = props;

    // GitHub Token Secret (managed externally via GitHub Actions)
    const githubTokenSecretName = `entrix-github-token-${environment}`;

    // CodeBuild Project with unique identifier to avoid conflicts
    const uniqueId = Date.now().toString().slice(-8); // Last 8 digits of timestamp
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: `entrix-energy-auction-build-${environment}-${uniqueId}`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        computeType: codebuild.ComputeType.SMALL
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '18'
            },
            commands: [
              'npm install -g aws-cdk',
              'npm ci'
            ]
          },
          pre_build: {
            commands: [
              'npm run test',
              'cdk synth EntrixEnergyAuctionStack-${environment}'
            ]
          },
          build: {
            commands: [
              'cdk deploy EntrixEnergyAuctionStack-${environment} --require-approval never'
            ]
          }
        }
      })
    });

    // Grant CodeBuild permissions to deploy CDK
    buildProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['*'],
      resources: ['*']
    }));

    // CodePipeline
    const sourceOutput = new codepipeline.Artifact();
    const buildOutput = new codepipeline.Artifact();

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `entrix-cicd-pipeline-${environment}`,
      pipelineType: codepipeline.PipelineType.V2,
      stages: [
        {
          stageName: 'Source',
          actions: [
            // Use GitHub Connection if provided, otherwise fallback to S3
            githubConnectionArn ? 
              new codepipelineActions.CodeStarConnectionsSourceAction({
                actionName: 'GitHub_Source',
                owner: 'devd',
                repo: 'entrix-task',
                branch: 'main',
                output: sourceOutput,
                connectionArn: githubConnectionArn,
              }) :
              new codepipelineActions.S3SourceAction({
                actionName: 'S3_Source_Placeholder',
                bucket: new s3.Bucket(this, 'PlaceholderSourceBucket', {
                  bucketName: `entrix-pipeline-source-${environment}-${cdk.Aws.ACCOUNT_ID}`,
                  versioned: true,
                  removalPolicy: cdk.RemovalPolicy.DESTROY,
                  autoDeleteObjects: true
                }),
                bucketKey: 'source.zip',
                output: sourceOutput,
              })
          ]
        },
        {
          stageName: 'Build',
          actions: [
            new codepipelineActions.CodeBuildAction({
              actionName: 'CodeBuild',
              project: buildProject,
              input: sourceOutput,
              outputs: [buildOutput]
            })
          ]
        }
      ]
    });

    // Outputs
    new cdk.CfnOutput(this, 'PipelineName', {
      value: pipeline.pipelineName,
      description: 'AWS CodePipeline name'
    });

    new cdk.CfnOutput(this, 'GitHubConnectionInfo', {
      value: githubConnectionArn || 'No GitHub connection provided - using S3 source',
      description: 'GitHub connection ARN or fallback info'
    });

    new cdk.CfnOutput(this, 'SetupInstructions', {
      value: githubConnectionArn ? 
        'GitHub connection configured successfully' : 
        'To use GitHub: 1) Create connection in AWS Console, 2) Redeploy with connectionArn parameter',
      description: 'Setup instructions'
    });

    new cdk.CfnOutput(this, 'BuildProjectName', {
      value: buildProject.projectName,
      description: 'CodeBuild project name'
    });
  }
}