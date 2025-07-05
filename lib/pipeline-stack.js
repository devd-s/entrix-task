"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineStack = void 0;
const cdk = require("aws-cdk-lib");
const codepipeline = require("aws-cdk-lib/aws-codepipeline");
const codepipelineActions = require("aws-cdk-lib/aws-codepipeline-actions");
const s3 = require("aws-cdk-lib/aws-s3");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const iam = require("aws-cdk-lib/aws-iam");
class PipelineStack extends cdk.Stack {
    constructor(scope, id, props) {
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
exports.PipelineStack = PipelineStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlwZWxpbmUtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwaXBlbGluZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMsNkRBQTZEO0FBQzdELDRFQUE0RTtBQUM1RSx5Q0FBeUM7QUFDekMsdURBQXVEO0FBRXZELDJDQUEyQztBQVEzQyxNQUFhLGFBQWMsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMxQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxXQUFXLEVBQUUsbUJBQW1CLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFbkQsOERBQThEO1FBQzlELE1BQU0scUJBQXFCLEdBQUcsdUJBQXVCLFdBQVcsRUFBRSxDQUFDO1FBRW5FLDhEQUE4RDtRQUM5RCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyw2QkFBNkI7UUFDL0UsTUFBTSxZQUFZLEdBQUcsSUFBSSxTQUFTLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDdkUsV0FBVyxFQUFFLCtCQUErQixXQUFXLElBQUksUUFBUSxFQUFFO1lBQ3JFLFdBQVcsRUFBRTtnQkFDWCxVQUFVLEVBQUUsU0FBUyxDQUFDLGVBQWUsQ0FBQyxZQUFZO2dCQUNsRCxXQUFXLEVBQUUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxLQUFLO2FBQ3pDO1lBQ0QsU0FBUyxFQUFFLFNBQVMsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDO2dCQUN4QyxPQUFPLEVBQUUsS0FBSztnQkFDZCxNQUFNLEVBQUU7b0JBQ04sT0FBTyxFQUFFO3dCQUNQLGtCQUFrQixFQUFFOzRCQUNsQixNQUFNLEVBQUUsSUFBSTt5QkFDYjt3QkFDRCxRQUFRLEVBQUU7NEJBQ1Isd0JBQXdCOzRCQUN4QixRQUFRO3lCQUNUO3FCQUNGO29CQUNELFNBQVMsRUFBRTt3QkFDVCxRQUFRLEVBQUU7NEJBQ1IsY0FBYzs0QkFDZCxtREFBbUQ7eUJBQ3BEO3FCQUNGO29CQUNELEtBQUssRUFBRTt3QkFDTCxRQUFRLEVBQUU7NEJBQ1IsNkVBQTZFO3lCQUM5RTtxQkFDRjtpQkFDRjthQUNGLENBQUM7U0FDSCxDQUFDLENBQUM7UUFFSCw0Q0FBNEM7UUFDNUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFDbkQsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztZQUN4QixPQUFPLEVBQUUsQ0FBQyxHQUFHLENBQUM7WUFDZCxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7U0FDakIsQ0FBQyxDQUFDLENBQUM7UUFFSixlQUFlO1FBQ2YsTUFBTSxZQUFZLEdBQUcsSUFBSSxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDakQsTUFBTSxXQUFXLEdBQUcsSUFBSSxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUM7UUFFaEQsTUFBTSxRQUFRLEdBQUcsSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDM0QsWUFBWSxFQUFFLHdCQUF3QixXQUFXLEVBQUU7WUFDbkQsWUFBWSxFQUFFLFlBQVksQ0FBQyxZQUFZLENBQUMsRUFBRTtZQUMxQyxNQUFNLEVBQUU7Z0JBQ047b0JBQ0UsU0FBUyxFQUFFLFFBQVE7b0JBQ25CLE9BQU8sRUFBRTt3QkFDUCw4REFBOEQ7d0JBQzlELG1CQUFtQixDQUFDLENBQUM7NEJBQ25CLElBQUksbUJBQW1CLENBQUMsK0JBQStCLENBQUM7Z0NBQ3RELFVBQVUsRUFBRSxlQUFlO2dDQUMzQixLQUFLLEVBQUUsTUFBTTtnQ0FDYixJQUFJLEVBQUUsYUFBYTtnQ0FDbkIsTUFBTSxFQUFFLE1BQU07Z0NBQ2QsTUFBTSxFQUFFLFlBQVk7Z0NBQ3BCLGFBQWEsRUFBRSxtQkFBbUI7NkJBQ25DLENBQUMsQ0FBQyxDQUFDOzRCQUNKLElBQUksbUJBQW1CLENBQUMsY0FBYyxDQUFDO2dDQUNyQyxVQUFVLEVBQUUsdUJBQXVCO2dDQUNuQyxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtvQ0FDckQsVUFBVSxFQUFFLDBCQUEwQixXQUFXLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUU7b0NBQ3pFLFNBQVMsRUFBRSxJQUFJO29DQUNmLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87b0NBQ3hDLGlCQUFpQixFQUFFLElBQUk7aUNBQ3hCLENBQUM7Z0NBQ0YsU0FBUyxFQUFFLFlBQVk7Z0NBQ3ZCLE1BQU0sRUFBRSxZQUFZOzZCQUNyQixDQUFDO3FCQUNMO2lCQUNGO2dCQUNEO29CQUNFLFNBQVMsRUFBRSxPQUFPO29CQUNsQixPQUFPLEVBQUU7d0JBQ1AsSUFBSSxtQkFBbUIsQ0FBQyxlQUFlLENBQUM7NEJBQ3RDLFVBQVUsRUFBRSxXQUFXOzRCQUN2QixPQUFPLEVBQUUsWUFBWTs0QkFDckIsS0FBSyxFQUFFLFlBQVk7NEJBQ25CLE9BQU8sRUFBRSxDQUFDLFdBQVcsQ0FBQzt5QkFDdkIsQ0FBQztxQkFDSDtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsVUFBVTtRQUNWLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3RDLEtBQUssRUFBRSxRQUFRLENBQUMsWUFBWTtZQUM1QixXQUFXLEVBQUUsdUJBQXVCO1NBQ3JDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUMsS0FBSyxFQUFFLG1CQUFtQixJQUFJLGlEQUFpRDtZQUMvRSxXQUFXLEVBQUUsd0NBQXdDO1NBQ3RELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDM0MsS0FBSyxFQUFFLG1CQUFtQixDQUFDLENBQUM7Z0JBQzFCLDJDQUEyQyxDQUFDLENBQUM7Z0JBQzdDLDhGQUE4RjtZQUNoRyxXQUFXLEVBQUUsb0JBQW9CO1NBQ2xDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxXQUFXO1lBQy9CLFdBQVcsRUFBRSx3QkFBd0I7U0FDdEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBMUhELHNDQTBIQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjb2RlcGlwZWxpbmUgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVwaXBlbGluZSc7XG5pbXBvcnQgKiBhcyBjb2RlcGlwZWxpbmVBY3Rpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlcGlwZWxpbmUtYWN0aW9ucyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY29kZWJ1aWxkIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlYnVpbGQnO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFBpcGVsaW5lU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgZ2l0aHViQ29ubmVjdGlvbkFybj86IHN0cmluZzsgLy8gT3B0aW9uYWw6IEdpdEh1YiBjb25uZWN0aW9uIEFSTlxufVxuXG5leHBvcnQgY2xhc3MgUGlwZWxpbmVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBQaXBlbGluZVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQsIGdpdGh1YkNvbm5lY3Rpb25Bcm4gfSA9IHByb3BzO1xuXG4gICAgLy8gR2l0SHViIFRva2VuIFNlY3JldCAobWFuYWdlZCBleHRlcm5hbGx5IHZpYSBHaXRIdWIgQWN0aW9ucylcbiAgICBjb25zdCBnaXRodWJUb2tlblNlY3JldE5hbWUgPSBgZW50cml4LWdpdGh1Yi10b2tlbi0ke2Vudmlyb25tZW50fWA7XG5cbiAgICAvLyBDb2RlQnVpbGQgUHJvamVjdCB3aXRoIHVuaXF1ZSBpZGVudGlmaWVyIHRvIGF2b2lkIGNvbmZsaWN0c1xuICAgIGNvbnN0IHVuaXF1ZUlkID0gRGF0ZS5ub3coKS50b1N0cmluZygpLnNsaWNlKC04KTsgLy8gTGFzdCA4IGRpZ2l0cyBvZiB0aW1lc3RhbXBcbiAgICBjb25zdCBidWlsZFByb2plY3QgPSBuZXcgY29kZWJ1aWxkLlBpcGVsaW5lUHJvamVjdCh0aGlzLCAnQnVpbGRQcm9qZWN0Jywge1xuICAgICAgcHJvamVjdE5hbWU6IGBlbnRyaXgtZW5lcmd5LWF1Y3Rpb24tYnVpbGQtJHtlbnZpcm9ubWVudH0tJHt1bmlxdWVJZH1gLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgYnVpbGRJbWFnZTogY29kZWJ1aWxkLkxpbnV4QnVpbGRJbWFnZS5TVEFOREFSRF81XzAsXG4gICAgICAgIGNvbXB1dGVUeXBlOiBjb2RlYnVpbGQuQ29tcHV0ZVR5cGUuU01BTExcbiAgICAgIH0sXG4gICAgICBidWlsZFNwZWM6IGNvZGVidWlsZC5CdWlsZFNwZWMuZnJvbU9iamVjdCh7XG4gICAgICAgIHZlcnNpb246ICcwLjInLFxuICAgICAgICBwaGFzZXM6IHtcbiAgICAgICAgICBpbnN0YWxsOiB7XG4gICAgICAgICAgICAncnVudGltZS12ZXJzaW9ucyc6IHtcbiAgICAgICAgICAgICAgbm9kZWpzOiAnMTgnXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgJ25wbSBpbnN0YWxsIC1nIGF3cy1jZGsnLFxuICAgICAgICAgICAgICAnbnBtIGNpJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgICAgcHJlX2J1aWxkOiB7XG4gICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAnbnBtIHJ1biB0ZXN0JyxcbiAgICAgICAgICAgICAgJ2NkayBzeW50aCBFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2stJHtlbnZpcm9ubWVudH0nXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSxcbiAgICAgICAgICBidWlsZDoge1xuICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgJ2NkayBkZXBsb3kgRW50cml4RW5lcmd5QXVjdGlvblN0YWNrLSR7ZW52aXJvbm1lbnR9IC0tcmVxdWlyZS1hcHByb3ZhbCBuZXZlcidcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBDb2RlQnVpbGQgcGVybWlzc2lvbnMgdG8gZGVwbG95IENES1xuICAgIGJ1aWxkUHJvamVjdC5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWycqJ10sXG4gICAgICByZXNvdXJjZXM6IFsnKiddXG4gICAgfSkpO1xuXG4gICAgLy8gQ29kZVBpcGVsaW5lXG4gICAgY29uc3Qgc291cmNlT3V0cHV0ID0gbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgpO1xuICAgIGNvbnN0IGJ1aWxkT3V0cHV0ID0gbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgpO1xuXG4gICAgY29uc3QgcGlwZWxpbmUgPSBuZXcgY29kZXBpcGVsaW5lLlBpcGVsaW5lKHRoaXMsICdQaXBlbGluZScsIHtcbiAgICAgIHBpcGVsaW5lTmFtZTogYGVudHJpeC1jaWNkLXBpcGVsaW5lLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHBpcGVsaW5lVHlwZTogY29kZXBpcGVsaW5lLlBpcGVsaW5lVHlwZS5WMixcbiAgICAgIHN0YWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnU291cmNlJyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAvLyBVc2UgR2l0SHViIENvbm5lY3Rpb24gaWYgcHJvdmlkZWQsIG90aGVyd2lzZSBmYWxsYmFjayB0byBTM1xuICAgICAgICAgICAgZ2l0aHViQ29ubmVjdGlvbkFybiA/IFxuICAgICAgICAgICAgICBuZXcgY29kZXBpcGVsaW5lQWN0aW9ucy5Db2RlU3RhckNvbm5lY3Rpb25zU291cmNlQWN0aW9uKHtcbiAgICAgICAgICAgICAgICBhY3Rpb25OYW1lOiAnR2l0SHViX1NvdXJjZScsXG4gICAgICAgICAgICAgICAgb3duZXI6ICdkZXZkJyxcbiAgICAgICAgICAgICAgICByZXBvOiAnZW50cml4LXRhc2snLFxuICAgICAgICAgICAgICAgIGJyYW5jaDogJ21haW4nLFxuICAgICAgICAgICAgICAgIG91dHB1dDogc291cmNlT3V0cHV0LFxuICAgICAgICAgICAgICAgIGNvbm5lY3Rpb25Bcm46IGdpdGh1YkNvbm5lY3Rpb25Bcm4sXG4gICAgICAgICAgICAgIH0pIDpcbiAgICAgICAgICAgICAgbmV3IGNvZGVwaXBlbGluZUFjdGlvbnMuUzNTb3VyY2VBY3Rpb24oe1xuICAgICAgICAgICAgICAgIGFjdGlvbk5hbWU6ICdTM19Tb3VyY2VfUGxhY2Vob2xkZXInLFxuICAgICAgICAgICAgICAgIGJ1Y2tldDogbmV3IHMzLkJ1Y2tldCh0aGlzLCAnUGxhY2Vob2xkZXJTb3VyY2VCdWNrZXQnLCB7XG4gICAgICAgICAgICAgICAgICBidWNrZXROYW1lOiBgZW50cml4LXBpcGVsaW5lLXNvdXJjZS0ke2Vudmlyb25tZW50fS0ke2Nkay5Bd3MuQUNDT1VOVF9JRH1gLFxuICAgICAgICAgICAgICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgICAgICAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlXG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgYnVja2V0S2V5OiAnc291cmNlLnppcCcsXG4gICAgICAgICAgICAgICAgb3V0cHV0OiBzb3VyY2VPdXRwdXQsXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnQnVpbGQnLFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgIG5ldyBjb2RlcGlwZWxpbmVBY3Rpb25zLkNvZGVCdWlsZEFjdGlvbih7XG4gICAgICAgICAgICAgIGFjdGlvbk5hbWU6ICdDb2RlQnVpbGQnLFxuICAgICAgICAgICAgICBwcm9qZWN0OiBidWlsZFByb2plY3QsXG4gICAgICAgICAgICAgIGlucHV0OiBzb3VyY2VPdXRwdXQsXG4gICAgICAgICAgICAgIG91dHB1dHM6IFtidWlsZE91dHB1dF1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1BpcGVsaW5lTmFtZScsIHtcbiAgICAgIHZhbHVlOiBwaXBlbGluZS5waXBlbGluZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FXUyBDb2RlUGlwZWxpbmUgbmFtZSdcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHaXRIdWJDb25uZWN0aW9uSW5mbycsIHtcbiAgICAgIHZhbHVlOiBnaXRodWJDb25uZWN0aW9uQXJuIHx8ICdObyBHaXRIdWIgY29ubmVjdGlvbiBwcm92aWRlZCAtIHVzaW5nIFMzIHNvdXJjZScsXG4gICAgICBkZXNjcmlwdGlvbjogJ0dpdEh1YiBjb25uZWN0aW9uIEFSTiBvciBmYWxsYmFjayBpbmZvJ1xuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1NldHVwSW5zdHJ1Y3Rpb25zJywge1xuICAgICAgdmFsdWU6IGdpdGh1YkNvbm5lY3Rpb25Bcm4gPyBcbiAgICAgICAgJ0dpdEh1YiBjb25uZWN0aW9uIGNvbmZpZ3VyZWQgc3VjY2Vzc2Z1bGx5JyA6IFxuICAgICAgICAnVG8gdXNlIEdpdEh1YjogMSkgQ3JlYXRlIGNvbm5lY3Rpb24gaW4gQVdTIENvbnNvbGUsIDIpIFJlZGVwbG95IHdpdGggY29ubmVjdGlvbkFybiBwYXJhbWV0ZXInLFxuICAgICAgZGVzY3JpcHRpb246ICdTZXR1cCBpbnN0cnVjdGlvbnMnXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQnVpbGRQcm9qZWN0TmFtZScsIHtcbiAgICAgIHZhbHVlOiBidWlsZFByb2plY3QucHJvamVjdE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZGVCdWlsZCBwcm9qZWN0IG5hbWUnXG4gICAgfSk7XG4gIH1cbn0iXX0=