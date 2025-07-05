"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineStack = void 0;
const cdk = require("aws-cdk-lib");
const codepipeline = require("aws-cdk-lib/aws-codepipeline");
const codepipelineActions = require("aws-cdk-lib/aws-codepipeline-actions");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const iam = require("aws-cdk-lib/aws-iam");
class PipelineStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment } = props;
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
                            oauthToken: cdk.SecretValue.secretsManager(githubTokenSecretName),
                            output: sourceOutput,
                            branch: 'main',
                            trigger: codepipelineActions.GitHubTrigger.WEBHOOK // Auto-trigger on push to main
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
            value: githubTokenSecretName,
            description: 'GitHub token secret name in Secrets Manager'
        });
        new cdk.CfnOutput(this, 'BuildProjectName', {
            value: buildProject.projectName,
            description: 'CodeBuild project name'
        });
    }
}
exports.PipelineStack = PipelineStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlwZWxpbmUtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwaXBlbGluZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMsNkRBQTZEO0FBQzdELDRFQUE0RTtBQUM1RSx1REFBdUQ7QUFFdkQsMkNBQTJDO0FBTzNDLE1BQWEsYUFBYyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQzFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUU5Qiw4REFBOEQ7UUFDOUQsTUFBTSxxQkFBcUIsR0FBRyx1QkFBdUIsV0FBVyxFQUFFLENBQUM7UUFFbkUsOERBQThEO1FBQzlELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLDZCQUE2QjtRQUMvRSxNQUFNLFlBQVksR0FBRyxJQUFJLFNBQVMsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN2RSxXQUFXLEVBQUUsK0JBQStCLFdBQVcsSUFBSSxRQUFRLEVBQUU7WUFDckUsV0FBVyxFQUFFO2dCQUNYLFVBQVUsRUFBRSxTQUFTLENBQUMsZUFBZSxDQUFDLFlBQVk7Z0JBQ2xELFdBQVcsRUFBRSxTQUFTLENBQUMsV0FBVyxDQUFDLEtBQUs7YUFDekM7WUFDRCxTQUFTLEVBQUUsU0FBUyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUM7Z0JBQ3hDLE9BQU8sRUFBRSxLQUFLO2dCQUNkLE1BQU0sRUFBRTtvQkFDTixPQUFPLEVBQUU7d0JBQ1Asa0JBQWtCLEVBQUU7NEJBQ2xCLE1BQU0sRUFBRSxJQUFJO3lCQUNiO3dCQUNELFFBQVEsRUFBRTs0QkFDUix3QkFBd0I7NEJBQ3hCLFFBQVE7eUJBQ1Q7cUJBQ0Y7b0JBQ0QsU0FBUyxFQUFFO3dCQUNULFFBQVEsRUFBRTs0QkFDUixjQUFjOzRCQUNkLG1EQUFtRDt5QkFDcEQ7cUJBQ0Y7b0JBQ0QsS0FBSyxFQUFFO3dCQUNMLFFBQVEsRUFBRTs0QkFDUiw2RUFBNkU7eUJBQzlFO3FCQUNGO2lCQUNGO2FBQ0YsQ0FBQztTQUNILENBQUMsQ0FBQztRQUVILDRDQUE0QztRQUM1QyxZQUFZLENBQUMsZUFBZSxDQUFDLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUNuRCxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRSxDQUFDLEdBQUcsQ0FBQztZQUNkLFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQztTQUNqQixDQUFDLENBQUMsQ0FBQztRQUVKLGVBQWU7UUFDZixNQUFNLFlBQVksR0FBRyxJQUFJLFlBQVksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNqRCxNQUFNLFdBQVcsR0FBRyxJQUFJLFlBQVksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUVoRCxNQUFNLFFBQVEsR0FBRyxJQUFJLFlBQVksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUMzRCxZQUFZLEVBQUUsa0NBQWtDLFdBQVcsRUFBRTtZQUM3RCxZQUFZLEVBQUUsWUFBWSxDQUFDLFlBQVksQ0FBQyxFQUFFO1lBQzFDLE1BQU0sRUFBRTtnQkFDTjtvQkFDRSxTQUFTLEVBQUUsUUFBUTtvQkFDbkIsT0FBTyxFQUFFO3dCQUNQLElBQUksbUJBQW1CLENBQUMsa0JBQWtCLENBQUM7NEJBQ3pDLFVBQVUsRUFBRSxlQUFlOzRCQUMzQixLQUFLLEVBQUUsTUFBTTs0QkFDYixJQUFJLEVBQUUsYUFBYTs0QkFDbkIsVUFBVSxFQUFFLEdBQUcsQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLHFCQUFxQixDQUFDOzRCQUNqRSxNQUFNLEVBQUUsWUFBWTs0QkFDcEIsTUFBTSxFQUFFLE1BQU07NEJBQ2QsT0FBTyxFQUFFLG1CQUFtQixDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUUsK0JBQStCO3lCQUNwRixDQUFDO3FCQUNIO2lCQUNGO2dCQUNEO29CQUNFLFNBQVMsRUFBRSxPQUFPO29CQUNsQixPQUFPLEVBQUU7d0JBQ1AsSUFBSSxtQkFBbUIsQ0FBQyxlQUFlLENBQUM7NEJBQ3RDLFVBQVUsRUFBRSxXQUFXOzRCQUN2QixPQUFPLEVBQUUsWUFBWTs0QkFDckIsS0FBSyxFQUFFLFlBQVk7NEJBQ25CLE9BQU8sRUFBRSxDQUFDLFdBQVcsQ0FBQzt5QkFDdkIsQ0FBQztxQkFDSDtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsVUFBVTtRQUNWLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3RDLEtBQUssRUFBRSxRQUFRLENBQUMsWUFBWTtZQUM1QixXQUFXLEVBQUUsdUJBQXVCO1NBQ3JDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDL0MsS0FBSyxFQUFFLHFCQUFxQjtZQUM1QixXQUFXLEVBQUUsNkNBQTZDO1NBQzNELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxXQUFXO1lBQy9CLFdBQVcsRUFBRSx3QkFBd0I7U0FDdEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdkdELHNDQXVHQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjb2RlcGlwZWxpbmUgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVwaXBlbGluZSc7XG5pbXBvcnQgKiBhcyBjb2RlcGlwZWxpbmVBY3Rpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlcGlwZWxpbmUtYWN0aW9ucyc7XG5pbXBvcnQgKiBhcyBjb2RlYnVpbGQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVidWlsZCc7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXInO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGlwZWxpbmVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgUGlwZWxpbmVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBQaXBlbGluZVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQgfSA9IHByb3BzO1xuXG4gICAgLy8gR2l0SHViIFRva2VuIFNlY3JldCAobWFuYWdlZCBleHRlcm5hbGx5IHZpYSBHaXRIdWIgQWN0aW9ucylcbiAgICBjb25zdCBnaXRodWJUb2tlblNlY3JldE5hbWUgPSBgZW50cml4LWdpdGh1Yi10b2tlbi0ke2Vudmlyb25tZW50fWA7XG5cbiAgICAvLyBDb2RlQnVpbGQgUHJvamVjdCB3aXRoIHVuaXF1ZSBpZGVudGlmaWVyIHRvIGF2b2lkIGNvbmZsaWN0c1xuICAgIGNvbnN0IHVuaXF1ZUlkID0gRGF0ZS5ub3coKS50b1N0cmluZygpLnNsaWNlKC04KTsgLy8gTGFzdCA4IGRpZ2l0cyBvZiB0aW1lc3RhbXBcbiAgICBjb25zdCBidWlsZFByb2plY3QgPSBuZXcgY29kZWJ1aWxkLlBpcGVsaW5lUHJvamVjdCh0aGlzLCAnQnVpbGRQcm9qZWN0Jywge1xuICAgICAgcHJvamVjdE5hbWU6IGBlbnRyaXgtZW5lcmd5LWF1Y3Rpb24tYnVpbGQtJHtlbnZpcm9ubWVudH0tJHt1bmlxdWVJZH1gLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgYnVpbGRJbWFnZTogY29kZWJ1aWxkLkxpbnV4QnVpbGRJbWFnZS5TVEFOREFSRF81XzAsXG4gICAgICAgIGNvbXB1dGVUeXBlOiBjb2RlYnVpbGQuQ29tcHV0ZVR5cGUuU01BTExcbiAgICAgIH0sXG4gICAgICBidWlsZFNwZWM6IGNvZGVidWlsZC5CdWlsZFNwZWMuZnJvbU9iamVjdCh7XG4gICAgICAgIHZlcnNpb246ICcwLjInLFxuICAgICAgICBwaGFzZXM6IHtcbiAgICAgICAgICBpbnN0YWxsOiB7XG4gICAgICAgICAgICAncnVudGltZS12ZXJzaW9ucyc6IHtcbiAgICAgICAgICAgICAgbm9kZWpzOiAnMTgnXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgJ25wbSBpbnN0YWxsIC1nIGF3cy1jZGsnLFxuICAgICAgICAgICAgICAnbnBtIGNpJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgICAgcHJlX2J1aWxkOiB7XG4gICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAnbnBtIHJ1biB0ZXN0JyxcbiAgICAgICAgICAgICAgJ2NkayBzeW50aCBFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2stJHtlbnZpcm9ubWVudH0nXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSxcbiAgICAgICAgICBidWlsZDoge1xuICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgJ2NkayBkZXBsb3kgRW50cml4RW5lcmd5QXVjdGlvblN0YWNrLSR7ZW52aXJvbm1lbnR9IC0tcmVxdWlyZS1hcHByb3ZhbCBuZXZlcidcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBDb2RlQnVpbGQgcGVybWlzc2lvbnMgdG8gZGVwbG95IENES1xuICAgIGJ1aWxkUHJvamVjdC5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWycqJ10sXG4gICAgICByZXNvdXJjZXM6IFsnKiddXG4gICAgfSkpO1xuXG4gICAgLy8gQ29kZVBpcGVsaW5lXG4gICAgY29uc3Qgc291cmNlT3V0cHV0ID0gbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgpO1xuICAgIGNvbnN0IGJ1aWxkT3V0cHV0ID0gbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgpO1xuXG4gICAgY29uc3QgcGlwZWxpbmUgPSBuZXcgY29kZXBpcGVsaW5lLlBpcGVsaW5lKHRoaXMsICdQaXBlbGluZScsIHtcbiAgICAgIHBpcGVsaW5lTmFtZTogYGVudHJpeC1lbmVyZ3ktYXVjdGlvbi1waXBlbGluZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBwaXBlbGluZVR5cGU6IGNvZGVwaXBlbGluZS5QaXBlbGluZVR5cGUuVjIsXG4gICAgICBzdGFnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHN0YWdlTmFtZTogJ1NvdXJjZScsXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgbmV3IGNvZGVwaXBlbGluZUFjdGlvbnMuR2l0SHViU291cmNlQWN0aW9uKHtcbiAgICAgICAgICAgICAgYWN0aW9uTmFtZTogJ0dpdEh1Yl9Tb3VyY2UnLFxuICAgICAgICAgICAgICBvd25lcjogJ2RldmQnLCBcbiAgICAgICAgICAgICAgcmVwbzogJ2VudHJpeC10YXNrJyxcbiAgICAgICAgICAgICAgb2F1dGhUb2tlbjogY2RrLlNlY3JldFZhbHVlLnNlY3JldHNNYW5hZ2VyKGdpdGh1YlRva2VuU2VjcmV0TmFtZSksXG4gICAgICAgICAgICAgIG91dHB1dDogc291cmNlT3V0cHV0LFxuICAgICAgICAgICAgICBicmFuY2g6ICdtYWluJyxcbiAgICAgICAgICAgICAgdHJpZ2dlcjogY29kZXBpcGVsaW5lQWN0aW9ucy5HaXRIdWJUcmlnZ2VyLldFQkhPT0sgIC8vIEF1dG8tdHJpZ2dlciBvbiBwdXNoIHRvIG1haW5cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnQnVpbGQnLFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgIG5ldyBjb2RlcGlwZWxpbmVBY3Rpb25zLkNvZGVCdWlsZEFjdGlvbih7XG4gICAgICAgICAgICAgIGFjdGlvbk5hbWU6ICdDb2RlQnVpbGQnLFxuICAgICAgICAgICAgICBwcm9qZWN0OiBidWlsZFByb2plY3QsXG4gICAgICAgICAgICAgIGlucHV0OiBzb3VyY2VPdXRwdXQsXG4gICAgICAgICAgICAgIG91dHB1dHM6IFtidWlsZE91dHB1dF1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1BpcGVsaW5lTmFtZScsIHtcbiAgICAgIHZhbHVlOiBwaXBlbGluZS5waXBlbGluZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FXUyBDb2RlUGlwZWxpbmUgbmFtZSdcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHaXRIdWJUb2tlblNlY3JldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogZ2l0aHViVG9rZW5TZWNyZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdHaXRIdWIgdG9rZW4gc2VjcmV0IG5hbWUgaW4gU2VjcmV0cyBNYW5hZ2VyJ1xuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0J1aWxkUHJvamVjdE5hbWUnLCB7XG4gICAgICB2YWx1ZTogYnVpbGRQcm9qZWN0LnByb2plY3ROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2RlQnVpbGQgcHJvamVjdCBuYW1lJ1xuICAgIH0pO1xuICB9XG59Il19