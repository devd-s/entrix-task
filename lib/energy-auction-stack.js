"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnergyAuctionStack = void 0;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const s3 = require("aws-cdk-lib/aws-s3");
const sns = require("aws-cdk-lib/aws-sns");
const stepfunctions = require("aws-cdk-lib/aws-stepfunctions");
const sfnTasks = require("aws-cdk-lib/aws-stepfunctions-tasks");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const iam = require("aws-cdk-lib/aws-iam");
const codepipeline = require("aws-cdk-lib/aws-codepipeline");
const codepipelineActions = require("aws-cdk-lib/aws-codepipeline-actions");
const codebuild = require("aws-cdk-lib/aws-codebuild");
class EnergyAuctionStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment } = props;
        // S3 Bucket for order results
        const orderResultsBucket = new s3.Bucket(this, 'OrderResultsBucket', {
            bucketName: `order-results-${environment}-${cdk.Aws.ACCOUNT_ID}`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED
        });
        // DynamoDB table for orders with 24-hour TTL
        const ordersTable = new dynamodb.Table(this, 'OrdersTable', {
            tableName: `orders-${environment}`,
            partitionKey: { name: 'record_id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            timeToLiveAttribute: 'ttl',
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        // SNS Topic for error notifications
        const errorNotificationTopic = new sns.Topic(this, 'ErrorNotificationTopic', {
            topicName: `error-notifications-${environment}`,
            displayName: 'Error Notifications for Energy Auction'
        });
        // Lambda Functions
        // POST Lambda for API
        const postLambda = new lambda.Function(this, 'PostLambda', {
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'app.lambda_handler',
            code: lambda.Code.fromAsset('src/post_lambda'),
            environment: {
                TABLE_NAME: ordersTable.tableName
            },
            timeout: cdk.Duration.seconds(30)
        });
        // Lambda A - Results generator
        const lambdaA = new lambda.Function(this, 'LambdaA', {
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'app.lambda_handler',
            code: lambda.Code.fromAsset('src/lambda_a'),
            timeout: cdk.Duration.seconds(30)
        });
        // Lambda B - Order processor
        const lambdaB = new lambda.Function(this, 'LambdaB', {
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'app.lambda_handler',
            code: lambda.Code.fromAsset('src/lambda_b'),
            environment: {
                LOG_BUCKET: orderResultsBucket.bucketName
            },
            timeout: cdk.Duration.seconds(30)
        });
        // Grant permissions
        ordersTable.grantReadWriteData(postLambda);
        orderResultsBucket.grantReadWrite(lambdaB);
        // API Gateway
        const api = new apigateway.RestApi(this, 'EnergyAuctionApi', {
            restApiName: `energy-auction-api-${environment}`,
            description: 'API for energy auction orders',
            deployOptions: {
                stageName: environment
            }
        });
        const ordersResource = api.root.addResource('orders');
        ordersResource.addMethod('POST', new apigateway.LambdaIntegration(postLambda));
        // Step Functions State Machine for data pipeline
        // Lambda A task
        const lambdaATask = new sfnTasks.LambdaInvoke(this, 'InvokeLambdaA', {
            lambdaFunction: lambdaA,
            outputPath: '$.Payload'
        });
        // Choice state to check results
        const checkResults = new stepfunctions.Choice(this, 'CheckResults')
            .when(stepfunctions.Condition.booleanEquals('$.results', false), lambdaATask // Retry Lambda A if results are false
        );
        // Map state to process each order
        const processOrdersMap = new stepfunctions.Map(this, 'ProcessOrders', {
            itemsPath: '$.orders',
            maxConcurrency: 10
        });
        // Lambda B task with error handling
        const lambdaBTask = new sfnTasks.LambdaInvoke(this, 'InvokeLambdaB', {
            lambdaFunction: lambdaB,
            inputPath: '$',
            resultPath: '$.result'
        });
        // SNS notification on error
        const sendErrorNotification = new sfnTasks.SnsPublish(this, 'SendErrorNotification', {
            topic: errorNotificationTopic,
            message: stepfunctions.TaskInput.fromObject({
                error: 'Lambda B failed to process order',
                input: stepfunctions.JsonPath.entirePayload,
                time: stepfunctions.JsonPath.stringAt('$$.State.EnteredTime')
            })
        });
        // Catch block for Lambda B errors
        const lambdaBWithErrorHandling = lambdaBTask.addCatch(sendErrorNotification, {
            errors: ['States.TaskFailed'],
            resultPath: '$.error'
        });
        processOrdersMap.iterator(lambdaBWithErrorHandling);
        // Success state
        const successState = new stepfunctions.Succeed(this, 'ProcessingComplete');
        // Define the state machine
        const definition = lambdaATask
            .next(checkResults
            .otherwise(processOrdersMap
            .next(successState)));
        const stateMachine = new stepfunctions.StateMachine(this, 'DataPipelineStateMachine', {
            stateMachineName: `data-pipeline-${environment}`,
            definition: definition,
            timeout: cdk.Duration.minutes(15)
        });
        // EventBridge rule to trigger the state machine on schedule
        const scheduleRule = new events.Rule(this, 'DataPipelineSchedule', {
            ruleName: `data-pipeline-schedule-${environment}`,
            schedule: events.Schedule.rate(cdk.Duration.hours(1)),
            targets: [
                new targets.SfnStateMachine(stateMachine)
            ]
        });
        // CodePipeline for CI/CD
        const sourceOutput = new codepipeline.Artifact();
        const buildOutput = new codepipeline.Artifact();
        const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
            projectName: `energy-auction-build-${environment}`,
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
                            'cdk synth'
                        ]
                    },
                    build: {
                        commands: [
                            'cdk deploy --require-approval never'
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
        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: `energy-auction-pipeline-${environment}`,
            stages: [
                {
                    stageName: 'Source',
                    actions: [
                        new codepipelineActions.GitHubSourceAction({
                            actionName: 'GitHub_Source',
                            owner: 'YOUR_GITHUB_USERNAME',
                            repo: 'cloud-engineer-challenge',
                            oauthToken: cdk.SecretValue.secretsManager('github-token'),
                            output: sourceOutput,
                            branch: 'master'
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
        new cdk.CfnOutput(this, 'ApiEndpoint', {
            value: api.url,
            description: 'API Gateway endpoint URL'
        });
        new cdk.CfnOutput(this, 'OrderResultsBucketName', {
            value: orderResultsBucket.bucketName,
            description: 'S3 bucket name for order results'
        });
        new cdk.CfnOutput(this, 'OrdersTableName', {
            value: ordersTable.tableName,
            description: 'DynamoDB table name for orders'
        });
        new cdk.CfnOutput(this, 'StateMachineArn', {
            value: stateMachine.stateMachineArn,
            description: 'Step Functions state machine ARN'
        });
    }
}
exports.EnergyAuctionStack = EnergyAuctionStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5lcmd5LWF1Y3Rpb24tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbmVyZ3ktYXVjdGlvbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMsaURBQWlEO0FBQ2pELHlEQUF5RDtBQUN6RCxxREFBcUQ7QUFDckQseUNBQXlDO0FBQ3pDLDJDQUEyQztBQUMzQywrREFBK0Q7QUFDL0QsZ0VBQWdFO0FBQ2hFLGlEQUFpRDtBQUNqRCwwREFBMEQ7QUFDMUQsMkNBQTJDO0FBQzNDLDZEQUE2RDtBQUM3RCw0RUFBNEU7QUFDNUUsdURBQXVEO0FBT3ZELE1BQWEsa0JBQW1CLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDL0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE4QjtRQUN0RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTlCLDhCQUE4QjtRQUM5QixNQUFNLGtCQUFrQixHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDbkUsVUFBVSxFQUFFLGlCQUFpQixXQUFXLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUU7WUFDaEUsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUN4QyxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLFNBQVMsRUFBRSxJQUFJO1lBQ2YsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1NBQzNDLENBQUMsQ0FBQztRQUVILDZDQUE2QztRQUM3QyxNQUFNLFdBQVcsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUMxRCxTQUFTLEVBQUUsVUFBVSxXQUFXLEVBQUU7WUFDbEMsWUFBWSxFQUFFLEVBQUUsSUFBSSxF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WSxDQUFDLGVBQWU7WUFDbkMsV0FBVyxFQUFFLGtDQUFrQztTQUNoRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFyUEQsZ0RBcVBDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBzdGVwZnVuY3Rpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zdGVwZnVuY3Rpb25zJztcbmltcG9ydCAqIGFzIHNmblRhc2tzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zdGVwZnVuY3Rpb25zLXRhc2tzJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGNvZGVwaXBlbGluZSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZXBpcGVsaW5lJztcbmltcG9ydCAqIGFzIGNvZGVwaXBlbGluZUFjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVwaXBlbGluZS1hY3Rpb25zJztcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWJ1aWxkJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVuZXJneUF1Y3Rpb25TdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRW5lcmd5QXVjdGlvblN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVuZXJneUF1Y3Rpb25TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGVudmlyb25tZW50IH0gPSBwcm9wcztcblxuICAgIC8vIFMzIEJ1Y2tldCBmb3Igb3JkZXIgcmVzdWx0c1xuICAgIGNvbnN0IG9yZGVyUmVzdWx0c0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ09yZGVyUmVzdWx0c0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBvcmRlci1yZXN1bHRzLSR7ZW52aXJvbm1lbnR9LSR7Y2RrLkF3cy5BQ0NPVU5UX0lEfWAsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRURcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIHRhYmxlIGZvciBvcmRlcnMgd2l0aCAyNC1ob3VyIFRUTFxuICAgIGNvbnN0IG9yZGVyc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdPcmRlcnNUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogYG9yZGVycy0ke2Vudmlyb25tZW50fWAsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3JlY29yZF9pZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgdGltZVRvTGl2ZUF0dHJpYnV0ZTogJ3R0bCcsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgfSk7XG5cbiAgICAvLyBTTlMgVG9waWMgZm9yIGVycm9yIG5vdGlmaWNhdGlvbnNcbiAgICBjb25zdCBlcnJvck5vdGlmaWNhdGlvblRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnRXJyb3JOb3RpZmljYXRpb25Ub3BpYycsIHtcbiAgICAgIHRvcGljTmFtZTogYGVycm9yLW5vdGlmaWNhdGlvbnMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZGlzcGxheU5hbWU6ICdFcnJvciBOb3RpZmljYXRpb25zIGZvciBFbmVyZ3kgQXVjdGlvbidcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBGdW5jdGlvbnNcbiAgICBcbiAgICAvLyBQT1NUIExhbWJkYSBmb3IgQVBJXG4gICAgY29uc3QgcG9zdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1Bvc3RMYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgaGFuZGxlcjogJ2FwcC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ3NyYy9wb3N0X2xhbWJkYScpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVEFCTEVfTkFNRTogb3JkZXJzVGFibGUudGFibGVOYW1lXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgQSAtIFJlc3VsdHMgZ2VuZXJhdG9yXG4gICAgY29uc3QgbGFtYmRhQSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0xhbWJkYUEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgaGFuZGxlcjogJ2FwcC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ3NyYy9sYW1iZGFfYScpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgQiAtIE9yZGVyIHByb2Nlc3NvclxuICAgIGNvbnN0IGxhbWJkYUIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdMYW1iZGFCJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOSxcbiAgICAgIGhhbmRsZXI6ICdhcHAubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdzcmMvbGFtYmRhX2InKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIExPR19CVUNLRVQ6IG9yZGVyUmVzdWx0c0J1Y2tldC5idWNrZXROYW1lXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9uc1xuICAgIG9yZGVyc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShwb3N0TGFtYmRhKTtcbiAgICBvcmRlclJlc3VsdHNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUobGFtYmRhQik7XG5cbiAgICAvLyBBUEkgR2F0ZXdheVxuICAgIGNvbnN0IGFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ0VuZXJneUF1Y3Rpb25BcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogYGVuZXJneS1hdWN0aW9uLWFwaS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBmb3IgZW5lcmd5IGF1Y3Rpb24gb3JkZXJzJyxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBlbnZpcm9ubWVudFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgb3JkZXJzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnb3JkZXJzJyk7XG4gICAgb3JkZXJzUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocG9zdExhbWJkYSkpO1xuXG4gICAgLy8gU3RlcCBGdW5jdGlvbnMgU3RhdGUgTWFjaGluZSBmb3IgZGF0YSBwaXBlbGluZVxuICAgIFxuICAgIC8vIExhbWJkYSBBIHRhc2tcbiAgICBjb25zdCBsYW1iZGFBVGFzayA9IG5ldyBzZm5UYXNrcy5MYW1iZGFJbnZva2UodGhpcywgJ0ludm9rZUxhbWJkYUEnLCB7XG4gICAgICBsYW1iZGFGdW5jdGlvbjogbGFtYmRhQSxcbiAgICAgIG91dHB1dFBhdGg6ICckLlBheWxvYWQnXG4gICAgfSk7XG5cbiAgICAvLyBDaG9pY2Ugc3RhdGUgdG8gY2hlY2sgcmVzdWx0c1xuICAgIGNvbnN0IGNoZWNrUmVzdWx0cyA9IG5ldyBzdGVwZnVuY3Rpb25zLkNob2ljZSh0aGlzLCAnQ2hlY2tSZXN1bHRzJylcbiAgICAgIC53aGVuKFxuICAgICAgICBzdGVwZnVuY3Rpb25zLkNvbmRpdGlvbi5ib29sZWFuRXF1YWxzKCckLnJlc3VsdHMnLCBmYWxzZSksXG4gICAgICAgIGxhbWJkYUFUYXNrIC8vIFJldHJ5IExhbWJkYSBBIGlmIHJlc3VsdHMgYXJlIGZhbHNlXG4gICAgICApO1xuXG4gICAgLy8gTWFwIHN0YXRlIHRvIHByb2Nlc3MgZWFjaCBvcmRlclxuICAgIGNvbnN0IHByb2Nlc3NPcmRlcnNNYXAgPSBuZXcgc3RlcGZ1bmN0aW9ucy5NYXAodGhpcywgJ1Byb2Nlc3NPcmRlcnMnLCB7XG4gICAgICBpdGVtc1BhdGg6ICckLm9yZGVycycsXG4gICAgICBtYXhDb25jdXJyZW5jeTogMTBcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBCIHRhc2sgd2l0aCBlcnJvciBoYW5kbGluZ1xuICAgIGNvbnN0IGxhbWJkYUJUYXNrID0gbmV3IHNmblRhc2tzLkxhbWJkYUludm9rZSh0aGlzLCAnSW52b2tlTGFtYmRhQicsIHtcbiAgICAgIGxhbWJkYUZ1bmN0aW9uOiBsYW1iZGFCLFxuICAgICAgaW5wdXRQYXRoOiAnJCcsXG4gICAgICByZXN1bHRQYXRoOiAnJC5yZXN1bHQnXG4gICAgfSk7XG5cbiAgICAvLyBTTlMgbm90aWZpY2F0aW9uIG9uIGVycm9yXG4gICAgY29uc3Qgc2VuZEVycm9yTm90aWZpY2F0aW9uID0gbmV3IHNmblRhc2tzLlNuc1B1Ymxpc2godGhpcywgJ1NlbmRFcnJvck5vdGlmaWNhdGlvbicsIHtcbiAgICAgIHRvcGljOiBlcnJvck5vdGlmaWNhdGlvblRvcGljLFxuICAgICAgbWVzc2FnZTogc3RlcGZ1bmN0aW9ucy5UYXNrSW5wdXQuZnJvbU9iamVjdCh7XG4gICAgICAgIGVycm9yOiAnTGFtYmRhIEIgZmFpbGVkIHRvIHByb2Nlc3Mgb3JkZXInLFxuICAgICAgICBpbnB1dDogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5lbnRpcmVQYXlsb2FkLFxuICAgICAgICB0aW1lOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckJC5TdGF0ZS5FbnRlcmVkVGltZScpXG4gICAgICB9KVxuICAgIH0pO1xuXG4gICAgLy8gQ2F0Y2ggYmxvY2sgZm9yIExhbWJkYSBCIGVycm9yc1xuICAgIGNvbnN0IGxhbWJkYUJXaXRoRXJyb3JIYW5kbGluZyA9IGxhbWJkYUJUYXNrLmFkZENhdGNoKHNlbmRFcnJvck5vdGlmaWNhdGlvbiwge1xuICAgICAgZXJyb3JzOiBbJ1N0YXRlcy5UYXNrRmFpbGVkJ10sXG4gICAgICByZXN1bHRQYXRoOiAnJC5lcnJvcidcbiAgICB9KTtcblxuICAgIHByb2Nlc3NPcmRlcnNNYXAuaXRlcmF0b3IobGFtYmRhQldpdGhFcnJvckhhbmRsaW5nKTtcblxuICAgIC8vIFN1Y2Nlc3Mgc3RhdGVcbiAgICBjb25zdCBzdWNjZXNzU3RhdGUgPSBuZXcgc3RlcGZ1bmN0aW9ucy5TdWNjZWVkKHRoaXMsICdQcm9jZXNzaW5nQ29tcGxldGUnKTtcblxuICAgIC8vIERlZmluZSB0aGUgc3RhdGUgbWFjaGluZVxuICAgIGNvbnN0IGRlZmluaXRpb24gPSBsYW1iZGFBVGFza1xuICAgICAgLm5leHQoY2hlY2tSZXN1bHRzXG4gICAgICAgIC5vdGhlcndpc2UocHJvY2Vzc09yZGVyc01hcFxuICAgICAgICAgIC5uZXh0KHN1Y2Nlc3NTdGF0ZSlcbiAgICAgICAgKVxuICAgICAgKTtcblxuICAgIGNvbnN0IHN0YXRlTWFjaGluZSA9IG5ldyBzdGVwZnVuY3Rpb25zLlN0YXRlTWFjaGluZSh0aGlzLCAnRGF0YVBpcGVsaW5lU3RhdGVNYWNoaW5lJywge1xuICAgICAgc3RhdGVNYWNoaW5lTmFtZTogYGRhdGEtcGlwZWxpbmUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZGVmaW5pdGlvbjogZGVmaW5pdGlvbixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KVxuICAgIH0pO1xuXG4gICAgLy8gRXZlbnRCcmlkZ2UgcnVsZSB0byB0cmlnZ2VyIHRoZSBzdGF0ZSBtYWNoaW5lIG9uIHNjaGVkdWxlXG4gICAgY29uc3Qgc2NoZWR1bGVSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdEYXRhUGlwZWxpbmVTY2hlZHVsZScsIHtcbiAgICAgIHJ1bGVOYW1lOiBgZGF0YS1waXBlbGluZS1zY2hlZHVsZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoY2RrLkR1cmF0aW9uLmhvdXJzKDEpKSwgLy8gUnVuIGV2ZXJ5IGhvdXJcbiAgICAgIHRhcmdldHM6IFtcbiAgICAgICAgbmV3IHRhcmdldHMuU2ZuU3RhdGVNYWNoaW5lKHN0YXRlTWFjaGluZSlcbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIENvZGVQaXBlbGluZSBmb3IgQ0kvQ0RcbiAgICBjb25zdCBzb3VyY2VPdXRwdXQgPSBuZXcgY29kZXBpcGVsaW5lLkFydGlmYWN0KCk7XG4gICAgY29uc3QgYnVpbGRPdXRwdXQgPSBuZXcgY29kZXBpcGVsaW5lLkFydGlmYWN0KCk7XG5cbiAgICBjb25zdCBidWlsZFByb2plY3QgPSBuZXcgY29kZWJ1aWxkLlBpcGVsaW5lUHJvamVjdCh0aGlzLCAnQnVpbGRQcm9qZWN0Jywge1xuICAgICAgcHJvamVjdE5hbWU6IGBlbmVyZ3ktYXVjdGlvbi1idWlsZC0ke2Vudmlyb25tZW50fWAsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBidWlsZEltYWdlOiBjb2RlYnVpbGQuTGludXhCdWlsZEltYWdlLlNUQU5EQVJEXzVfMCxcbiAgICAgICAgY29tcHV0ZVR5cGU6IGNvZGVidWlsZC5Db21wdXRlVHlwZS5TTUFMTFxuICAgICAgfSxcbiAgICAgIGJ1aWxkU3BlYzogY29kZWJ1aWxkLkJ1aWxkU3BlYy5mcm9tT2JqZWN0KHtcbiAgICAgICAgdmVyc2lvbjogJzAuMicsXG4gICAgICAgIHBoYXNlczoge1xuICAgICAgICAgIGluc3RhbGw6IHtcbiAgICAgICAgICAgICdydW50aW1lLXZlcnNpb25zJzoge1xuICAgICAgICAgICAgICBub2RlanM6ICcxOCdcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAnbnBtIGluc3RhbGwgLWcgYXdzLWNkaycsXG4gICAgICAgICAgICAgICducG0gY2knXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSxcbiAgICAgICAgICBwcmVfYnVpbGQ6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICducG0gcnVuIHRlc3QnLFxuICAgICAgICAgICAgICAnY2RrIHN5bnRoJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgICAgYnVpbGQ6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICdjZGsgZGVwbG95IC0tcmVxdWlyZS1hcHByb3ZhbCBuZXZlcidcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBDb2RlQnVpbGQgcGVybWlzc2lvbnMgdG8gZGVwbG95IENES1xuICAgIGJ1aWxkUHJvamVjdC5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWycqJ10sXG4gICAgICByZXNvdXJjZXM6IFsnKiddXG4gICAgfSkpO1xuXG4gICAgY29uc3QgcGlwZWxpbmUgPSBuZXcgY29kZXBpcGVsaW5lLlBpcGVsaW5lKHRoaXMsICdQaXBlbGluZScsIHtcbiAgICAgIHBpcGVsaW5lTmFtZTogYGVuZXJneS1hdWN0aW9uLXBpcGVsaW5lLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHN0YWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnU291cmNlJyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICBuZXcgY29kZXBpcGVsaW5lQWN0aW9ucy5HaXRIdWJTb3VyY2VBY3Rpb24oe1xuICAgICAgICAgICAgICBhY3Rpb25OYW1lOiAnR2l0SHViX1NvdXJjZScsXG4gICAgICAgICAgICAgIG93bmVyOiAnWU9VUl9HSVRIVUJfVVNFUk5BTUUnLCAvLyBSZXBsYWNlIHdpdGggYWN0dWFsIHVzZXJuYW1lXG4gICAgICAgICAgICAgIHJlcG86ICdjbG91ZC1lbmdpbmVlci1jaGFsbGVuZ2UnLFxuICAgICAgICAgICAgICBvYXV0aFRva2VuOiBjZGsuU2VjcmV0VmFsdWUuc2VjcmV0c01hbmFnZXIoJ2dpdGh1Yi10b2tlbicpLFxuICAgICAgICAgICAgICBvdXRwdXQ6IHNvdXJjZU91dHB1dCxcbiAgICAgICAgICAgICAgYnJhbmNoOiAnbWFzdGVyJ1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdGFnZU5hbWU6ICdCdWlsZCcsXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgbmV3IGNvZGVwaXBlbGluZUFjdGlvbnMuQ29kZUJ1aWxkQWN0aW9uKHtcbiAgICAgICAgICAgICAgYWN0aW9uTmFtZTogJ0NvZGVCdWlsZCcsXG4gICAgICAgICAgICAgIHByb2plY3Q6IGJ1aWxkUHJvamVjdCxcbiAgICAgICAgICAgICAgaW5wdXQ6IHNvdXJjZU91dHB1dCxcbiAgICAgICAgICAgICAgb3V0cHV0czogW2J1aWxkT3V0cHV0XVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgZW5kcG9pbnQgVVJMJ1xuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ09yZGVyUmVzdWx0c0J1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogb3JkZXJSZXN1bHRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIGJ1Y2tldCBuYW1lIGZvciBvcmRlciByZXN1bHRzJ1xuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ09yZGVyc1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBvcmRlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIG9yZGVycydcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdGF0ZU1hY2hpbmVBcm4nLCB7XG4gICAgICB2YWx1ZTogc3RhdGVNYWNoaW5lLnN0YXRlTWFjaGluZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RlcCBGdW5jdGlvbnMgc3RhdGUgbWFjaGluZSBBUk4nXG4gICAgfSk7XG4gIH1cbn0iXX0=