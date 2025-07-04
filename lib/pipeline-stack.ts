import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface PipelineStackProps extends cdk.StackProps {
  environment: string;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // GitHub Token Secret for CodePipeline
    const githubToken = process.env.PERSONAL_ACCESS_TOKEN;
    const githubTokenSecret = new secretsmanager.Secret(this, 'GitHubTokenSecret', {
      secretName: `entrix-github-token-${environment}`,
      description: 'GitHub PAT for CodePipeline',
      secretStringValue: githubToken ? cdk.SecretValue.unsafePlainText(githubToken) : undefined
    });

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
      pipelineName: `entrix-energy-auction-pipeline-${environment}`,
      pipelineType: codepipeline.PipelineType.V2,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipelineActions.GitHubSourceAction({
              actionName: 'GitHub_Source',
              owner: 'devd', 
              repo: 'entrix-task',
              oauthToken: cdk.SecretValue.secretsManager(`entrix-github-token-${environment}`),
              output: sourceOutput,
              branch: 'main',
              trigger: codepipelineActions.GitHubTrigger.WEBHOOK  // Auto-trigger on push to main
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

    new cdk.CfnOutput(this, 'GitHubTokenSecretName', {
      value: githubTokenSecret.secretName,
      description: 'GitHub token secret name in Secrets Manager'
    });

    new cdk.CfnOutput(this, 'BuildProjectName', {
      value: buildProject.projectName,
      description: 'CodeBuild project name'
    });
  }
}