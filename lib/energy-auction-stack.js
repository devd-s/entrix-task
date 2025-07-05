"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntrixEnergyAuctionStack = void 0;
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
const snsSubscriptions = require("aws-cdk-lib/aws-sns-subscriptions");
class EntrixEnergyAuctionStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment, githubConnectionArn } = props;
        // ENVIRONMENT-SPECIFIC CONFIGURATIONS (COMMENTED)
        // Uncomment to use environment-specific settings
        // const scheduleDuration = props.scheduleDuration ?? 1;  // Default 1 hour
        // const retentionDays = props.retentionDays ?? 7;        // Default 7 days
        // S3 Bucket for order results
        const orderResultsBucket = new s3.Bucket(this, 'OrderResultsBucket', {
            bucketName: `entrix-order-results-${environment}-${cdk.Aws.ACCOUNT_ID}`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED
        });
        // DynamoDB table for orders with 24-hour TTL
        const ordersTable = new dynamodb.Table(this, 'OrdersTable', {
            tableName: `entrix-orders-${environment}`,
            partitionKey: { name: 'record_id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            timeToLiveAttribute: 'ttl',
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        // SNS Topic for error notifications
        const errorNotificationTopic = new sns.Topic(this, 'ErrorNotificationTopic', {
            topicName: `error-notifications-${environment}`,
            displayName: 'Error Notifications for Energy Auction Issues'
        });
        // We'll handle DynamoDB decimal conversion via environment variables
        // The Lambda code can check for DYNAMODB_FLOAT_SERIALIZER env var
        // Lambda Functions
        // POST Lambda for API
        const postLambda = new lambda.Function(this, 'EntrixPostLambda', {
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'app.lambda_handler',
            code: lambda.Code.fromAsset('src/post_lambda'),
            environment: {
                TABLE_NAME: ordersTable.tableName,
                DYNAMODB_FLOAT_SERIALIZER: 'use_decimal' // Configure float handling via env var
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
            code: lambda.Code.fromAsset('src/lambda_b', {
                bundling: {
                    image: lambda.Runtime.PYTHON_3_9.bundlingImage,
                    command: [
                        'bash', '-c',
                        'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
                    ],
                },
            }),
            environment: {
                LOG_BUCKET: orderResultsBucket.bucketName
            },
            timeout: cdk.Duration.seconds(30)
        });
        // Slack Notification Lambda (subscribes to SNS for error alerts)
        const slackNotificationLambda = new lambda.Function(this, 'SlackNotificationLambda', {
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromInline(`
import json
import urllib3
import os

def lambda_handler(event, context):
    """
    Process SNS notification and send formatted message to Slack
    """
    # Parse SNS message
    sns_message = json.loads(event['Records'][0]['Sns']['Message'])
    
    # Get Slack webhook URL from environment (would be set in real deployment)
    slack_webhook_url = os.environ.get('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK')
    
    # Format Slack message
    slack_payload = {
        "text": f"🚨 *{sns_message.get('alert', 'Error Alert')}*",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"🚨 {sns_message.get('service', 'Service')} Alert"
                }
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": f"*Environment:*\\n{sns_message.get('environment', 'unknown')}"
                    },
                    {
                        "type": "mrkdwn", 
                        "text": f"*Error:*\\n{sns_message.get('error', 'Unknown error')}"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Execution:*\\n{sns_message.get('executionName', 'N/A')}"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Timestamp:*\\n{sns_message.get('timestamp', 'N/A')}"
                    }
                ]
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Error Details:*\\n\`\`\`{sns_message.get('errorDetails', 'No details available')}\`\`\`"
                }
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"Region: {sns_message.get('region', 'N/A')} | State Machine: {sns_message.get('stateMachineArn', 'N/A')}"
                    }
                ]
            }
        ]
    }
    
    # Send to Slack (in production, you'd use the actual webhook)
    http = urllib3.PoolManager()
    
    try:
        response = http.request(
            'POST',
            slack_webhook_url,
            body=json.dumps(slack_payload),
            headers={'Content-Type': 'application/json'}
        )
        
        print(f"Slack notification sent successfully. Status: {response.status}")
        print(f"Payload: {json.dumps(slack_payload, indent=2)}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Notification sent successfully',
                'slack_response_status': response.status
            })
        }
        
    except Exception as e:
        print(f"Failed to send Slack notification: {str(e)}")
        print(f"Would have sent: {json.dumps(slack_payload, indent=2)}")
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to send notification',
                'details': str(e)
            })
        }
      `),
            environment: {
                'SLACK_WEBHOOK_URL': 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK' // Replace with actual webhook
            },
            timeout: cdk.Duration.seconds(30),
            description: 'Sends formatted error notifications to Slack channel'
        });
        // Subscribe Slack Lambda to SNS topic
        errorNotificationTopic.addSubscription(new snsSubscriptions.LambdaSubscription(slackNotificationLambda));
        // Add email subscription for critical alerts (replace with actual email)
        errorNotificationTopic.addSubscription(new snsSubscriptions.EmailSubscription('devops-team@company.com'));
        // Optional: Add SMS subscription for urgent alerts
        // errorNotificationTopic.addSubscription(
        //   new snsSubscriptions.SmsSubscription('+1234567890')
        // );
        // Grant permissions
        ordersTable.grantReadWriteData(postLambda);
        orderResultsBucket.grantReadWrite(lambdaB);
        // API Gateway
        const api = new apigateway.RestApi(this, 'EnergyAuctionApi', {
            restApiName: `entrix-energy-auction-api-${environment}`,
            description: 'API for energy auction orders',
            deployOptions: {
                stageName: environment
            }
        });
        const ordersResource = api.root.addResource('orders');
        ordersResource.addMethod('POST', new apigateway.LambdaIntegration(postLambda));
        // Step Functions State Machine for data pipeline
        // Lambda A task with retry configuration
        const lambdaATask = new sfnTasks.LambdaInvoke(this, 'InvokeLambdaA', {
            lambdaFunction: lambdaA,
            outputPath: '$.Payload',
            retryOnServiceExceptions: true,
            payload: stepfunctions.TaskInput.fromObject({
                "attempt.$": "$.attempt",
                "input.$": "$"
            })
        });
        // Add attempt counter initialization
        const initializeAttempt = new stepfunctions.Pass(this, 'InitializeAttempt', {
            result: stepfunctions.Result.fromObject({ attempt: 1 }),
            resultPath: '$.attempt'
        });
        // Increment attempt counter
        const incrementAttempt = new stepfunctions.Pass(this, 'IncrementAttempt', {
            parameters: {
                "attempt.$": "States.MathAdd($.attempt, 1)",
                "input.$": "$"
            }
        });
        // Check max retries
        const maxRetryCheck = new stepfunctions.Choice(this, 'CheckMaxRetries')
            .when(stepfunctions.Condition.numberGreaterThan('$.attempt', 5), new stepfunctions.Fail(this, 'MaxRetriesExceeded', {
            error: 'LambdaAMaxRetries',
            cause: 'Lambda A failed to return true results after 5 attempts'
        }));
        // Choice state to check results
        const checkResults = new stepfunctions.Choice(this, 'CheckResults')
            .when(stepfunctions.Condition.booleanEquals('$.results', false), incrementAttempt.next(maxRetryCheck.otherwise(lambdaATask)));
        // Map state to process each order
        const processOrdersMap = new stepfunctions.Map(this, 'ProcessOrders', {
            itemsPath: '$.orders',
            maxConcurrency: 10
        });
        // Data transformation for Lambda B compatibility
        const transformForLambdaB = new stepfunctions.Pass(this, 'TransformForLambdaB', {
            parameters: {
                "status.$": "$.order",
                "id.$": "$.id",
                "timestamp.$": "$.timestamp",
                "data.$": "$" // Pass through all original data
            }
        });
        // Lambda B task with error handling
        const lambdaBTask = new sfnTasks.LambdaInvoke(this, 'InvokeLambdaB', {
            lambdaFunction: lambdaB,
            inputPath: '$',
            resultPath: '$.result'
        });
        // Enhanced SNS notification on error with detailed context
        const sendErrorNotification = new sfnTasks.SnsPublish(this, 'SendErrorNotification', {
            topic: errorNotificationTopic,
            subject: '🚨 Lambda B Processing Error',
            message: stepfunctions.TaskInput.fromObject({
                alert: '🚨 Lambda B Error',
                environment: environment,
                service: 'Energy Auction Processing',
                error: 'Lambda B failed to process order',
                errorDetails: stepfunctions.JsonPath.stringAt('$.error.Error'),
                failedOrder: stepfunctions.JsonPath.objectAt('$.data'),
                executionName: stepfunctions.JsonPath.stringAt('$$.Execution.Name'),
                timestamp: stepfunctions.JsonPath.stringAt('$$.State.EnteredTime'),
                stateMachineArn: stepfunctions.JsonPath.stringAt('$$.StateMachine.Name'),
                region: 'eu-west-1'
            })
        });
        // Catch block for Lambda B errors
        const lambdaBWithErrorHandling = lambdaBTask.addCatch(sendErrorNotification, {
            errors: ['States.TaskFailed'],
            resultPath: '$.error'
        });
        processOrdersMap.iterator(transformForLambdaB.next(lambdaBWithErrorHandling));
        // Success state
        const successState = new stepfunctions.Succeed(this, 'ProcessingComplete');
        // Define the state machine
        const definition = initializeAttempt
            .next(lambdaATask
            .next(checkResults
            .otherwise(processOrdersMap
            .next(successState))));
        const stateMachine = new stepfunctions.StateMachine(this, 'DataPipelineStateMachine', {
            stateMachineName: `entrix-data-pipeline-${environment}`,
            definition: definition,
            timeout: cdk.Duration.minutes(15)
        });
        // EventBridge rule to trigger the state machine on schedule
        const scheduleRule = new events.Rule(this, 'DataPipelineSchedule', {
            ruleName: `data-pipeline-schedule-${environment}`,
            schedule: events.Schedule.rate(cdk.Duration.hours(1)),
            // ENVIRONMENT-SPECIFIC SCHEDULE (COMMENTED)
            // Uncomment to use different schedules per environment:
            // schedule: events.Schedule.rate(cdk.Duration.hours(scheduleDuration)),
            targets: [
                new targets.SfnStateMachine(stateMachine)
            ]
        });
        // GitHub Token Secret for CodePipeline (managed externally by GitHub Actions)
        // CodePipeline for CI/CD
        const sourceOutput = new codepipeline.Artifact();
        const buildOutput = new codepipeline.Artifact();
        // S3 Bucket for CodePipeline artifacts
        const pipelineArtifactsBucket = new s3.Bucket(this, 'PipelineArtifactsBucket', {
            bucketName: `entrix-pipeline-artifacts-${environment}-${cdk.Aws.ACCOUNT_ID}`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED
        });
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
            pipelineName: `entrix-energy-auction-pipeline-${environment}`,
            artifactBucket: pipelineArtifactsBucket,
            stages: [
                {
                    stageName: 'Source',
                    actions: [
                        // Use GitHub Connection if provided, otherwise use GitHub OAuth
                        githubConnectionArn ?
                            new codepipelineActions.CodeStarConnectionsSourceAction({
                                actionName: 'GitHub_Source',
                                owner: 'devd-s',
                                repo: 'entrix-task',
                                branch: 'master',
                                output: sourceOutput,
                                connectionArn: githubConnectionArn,
                            }) :
                            new codepipelineActions.GitHubSourceAction({
                                actionName: 'GitHub_Source',
                                owner: 'devd-s',
                                repo: 'entrix-task',
                                oauthToken: cdk.SecretValue.secretsManager(`entrix-github-token-${environment}`),
                                output: sourceOutput,
                                branch: 'master',
                                trigger: codepipelineActions.GitHubTrigger.POLL // Use polling instead of webhooks
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
        // Pipeline Outputs
        new cdk.CfnOutput(this, 'PipelineName', {
            value: pipeline.pipelineName,
            description: 'AWS CodePipeline name'
        });
        new cdk.CfnOutput(this, 'BuildProjectName', {
            value: buildProject.projectName,
            description: 'CodeBuild project name'
        });
        new cdk.CfnOutput(this, 'GitHubConnectionInfo', {
            value: githubConnectionArn || 'No GitHub connection provided - using GitHub OAuth',
            description: 'GitHub connection status'
        });
        new cdk.CfnOutput(this, 'PipelineArtifactsBucketName', {
            value: pipelineArtifactsBucket.bucketName,
            description: 'S3 bucket name for pipeline artifacts'
        });
    }
}
exports.EntrixEnergyAuctionStack = EntrixEnergyAuctionStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5lcmd5LWF1Y3Rpb24tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbmVyZ3ktYXVjdGlvbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMsaURBQWlEO0FBQ2pELHlEQUF5RDtBQUN6RCxxREFBcUQ7QUFDckQseUNBQXlDO0FBQ3pDLDJDQUEyQztBQUMzQywrREFBK0Q7QUFDL0QsZ0VBQWdFO0FBQ2hFLGlEQUFpRDtBQUNqRCwwREFBMEQ7QUFDMUQsMkNBQTJDO0FBQzNDLDZEQUE2RDtBQUM3RCw0RUFBNEU7QUFDNUUsdURBQXVEO0FBRXZELHNFQUFzRTtBQWF0RSxNQUFhLHdCQUF5QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3JELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0M7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxtQkFBbUIsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUVuRCxrREFBa0Q7UUFDbEQsaURBQWlEO1FBQ2pELDJFQUEyRTtRQUMzRSwyRUFBMkU7UUFFM0UsOEJBQThCO1FBQzlCLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUNuRSxVQUFVLEVBQUUsd0JBQXdCLFdBQVcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRTtZQUN2RSxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsU0FBUyxFQUFFLElBQUk7WUFDZixVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7U0FDM0MsQ0FBQyxDQUFDO1FBRUgsNkNBQTZDO1FBQzdDLE1BQU0sV0FBVyxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQzFELFNBQVMsRUFBRSxpQkFBaUIsV0FBVyxFQUFFO1lBQ3pDLFlBQVksRUFBRSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFO1lBQ3hFLFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLGVBQWU7WUFDakQsbUJBQW1CLEVBQUUsS0FBSztZQUMxQixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1NBQ3pDLENBQUMsQ0FBQztRQUVILG9DQUFvQztRQUNwQyxNQUFNLHNCQUFzQixHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDM0UsU0FBUyxFQUFFLHVCQUF1QixXQUFXLEVBQUU7WUFDL0MsV0FBVyxFQUFFLCtDQUErQztTQUM3RCxDQUFDLENBQUM7UUFFSCxxRUFBcUU7UUFDckUsa0VBQWtFO1FBRWxFLG1CQUFtQjtRQUVuQixzQkFBc0I7UUFDdEIsTUFBTSxVQUFVLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMvRCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVO1lBQ2xDLE9BQU8sRUFBRSxvQkFBb0I7WUFDN0IsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGlCQUFpQixDQUFDO1lBQzlDLFdBQVcsRUFBRTtnQkFDWCxVQUFVLEVBQUUsV0FBVyxDQUFDLFNBQVM7Z0JBQ2pDLHlCQUF5QixFQUFFLGFBQWEsQ0FBQyx1Q0FBdUM7YUFDakY7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1NBQ2xDLENBQUMsQ0FBQztRQUVILCtCQUErQjtRQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNuRCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVO1lBQ2xDLE9BQU8sRUFBRSxvQkFBb0I7WUFDN0IsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQztZQUMzQyxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1NBQ2xDLENBQUMsQ0FBQztRQUVILDZCQUE2QjtRQUM3QixNQUFNLE9BQU8sR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNuRCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVO1lBQ2xDLE9BQU8sRUFBRSxvQkFBb0I7WUFDN0IsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsRUFBRTtnQkFDMUMsUUFBUSxFQUFFO29CQUNSLEtBQUssRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxhQUFhO29CQUM5QyxPQUFPLEVBQUU7d0JBQ1AsTUFBTSxFQUFFLElBQUk7d0JBQ1osNEVBQTRFO3FCQUM3RTtpQkFDRjthQUNGLENBQUM7WUFDRixXQUFXLEVBQUU7Z0JBQ1gsVUFBVSxFQUFFLGtCQUFrQixDQUFDLFVBQVU7YUFDMUM7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1NBQ2xDLENBQUMsQ0FBQztRQUVILGlFQUFpRTtRQUNqRSxNQUFNLHVCQUF1QixHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUseUJBQXlCLEVBQUU7WUFDbkYsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsVUFBVTtZQUNsQyxPQUFPLEVBQUUsc0JBQXNCO1lBQy9CLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O09BbUc1QixDQUFDO1lBQ0YsV0FBVyxFQUFFO2dCQUNYLG1CQUFtQixFQUFFLHFEQUFxRCxDQUFDLDhCQUE4QjthQUMxRztZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsV0FBVyxFQUFFLHNEQUFzRDtTQUNwRSxDQUFDLENBQUM7UUFFSCxzQ0FBc0M7UUFDdEMsc0JBQXNCLENBQUMsZUFBZSxDQUNwQyxJQUFJLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDLHVCQUF1QixDQUFDLENBQ2pFLENBQUM7UUFFRix5RUFBeUU7UUFDekUsc0JBQXNCLENBQUMsZUFBZSxDQUNwQyxJQUFJLGdCQUFnQixDQUFDLGlCQUFpQixDQUFDLHlCQUF5QixDQUFDLENBQ2xFLENBQUM7UUFFRixtREFBbUQ7UUFDbkQsMENBQTBDO1FBQzFDLHdEQUF3RDtRQUN4RCxLQUFLO1FBR0wsb0JBQW9CO1FBQ3BCLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzQyxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFM0MsY0FBYztRQUNkLE1BQU0sR0FBRyxHQUFHLElBQUksVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDM0QsV0FBVyxFQUFFLDZCQUE2QixXQUFXLEVBQUU7WUFDdkQsV0FBVyxFQUFFLCtCQUErQjtZQUM1QyxhQUFhLEVBQUU7Z0JBQ2IsU0FBUyxFQUFFLFdBQVc7YUFDdkI7U0FDRixDQUFDLENBQUM7UUFFSCxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0RCxjQUFjLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBRS9FLGlEQUFpRDtRQUVqRCx5Q0FBeUM7UUFDekMsTUFBTSxXQUFXLEdBQUcsSUFBSSxRQUFRLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDbkUsY0FBYyxFQUFFLE9BQU87WUFDdkIsVUFBVSxFQUFFLFdBQVc7WUFDdkIsd0JBQXdCLEVBQUUsSUFBSTtZQUM5QixPQUFPLEVBQUUsYUFBYSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUM7Z0JBQzFDLFdBQVcsRUFBRSxXQUFXO2dCQUN4QixTQUFTLEVBQUUsR0FBRzthQUNmLENBQUM7U0FDSCxDQUFDLENBQUM7UUFFSCxxQ0FBcUM7UUFDckMsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQzFFLE1BQU0sRUFBRSxhQUFhLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUN2RCxVQUFVLEVBQUUsV0FBVztTQUN4QixDQUFDLENBQUM7UUFFSCw0QkFBNEI7UUFDNUIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQ3hFLFVBQVUsRUFBRTtnQkFDVixXQUFXLEVBQUUsOEJBQThCO2dCQUMzQyxTQUFTLEVBQUUsR0FBRzthQUNmO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsb0JBQW9CO1FBQ3BCLE1BQU0sYUFBYSxHQUFHLElBQUksYUFBYSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLENBQUM7YUFDcEUsSUFBSSxDQUNILGFBQWEsQ0FBQyxTQUFTLENBQUMsaUJBQWlCLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxFQUN6RCxJQUFJLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ2pELEtBQUssRUFBRSxtQkFBbUI7WUFDMUIsS0FBSyxFQUFFLHlEQUF5RDtTQUNqRSxDQUFDLENBQ0gsQ0FBQztRQUVKLGdDQUFnQztRQUNoQyxNQUFNLFlBQVksR0FBRyxJQUFJLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQzthQUNoRSxJQUFJLENBQ0gsYUFBYSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxFQUN6RCxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUM1RCxDQUFDO1FBRUosa0NBQWtDO1FBQ2xDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxhQUFhLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDcEUsU0FBUyxFQUFFLFVBQVU7WUFDckIsY0FBYyxFQUFFLEVBQUU7U0FDbkIsQ0FBQyxDQUFDO1FBRUgsaURBQWlEO1FBQ2pELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUM5RSxVQUFVLEVBQUU7Z0JBQ1YsVUFBVSxFQUFFLFNBQVM7Z0JBQ3JCLE1BQU0sRUFBRSxNQUFNO2dCQUNkLGFBQWEsRUFBRSxhQUFhO2dCQUM1QixRQUFRLEVBQUUsR0FBRyxDQUFDLGlDQUFpQzthQUNoRDtTQUNGLENBQUMsQ0FBQztRQUVILG9DQUFvQztRQUNwQyxNQUFNLFdBQVcsR0FBRyxJQUFJLFFBQVEsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUNuRSxjQUFjLEVBQUUsT0FBTztZQUN2QixTQUFTLEVBQUUsR0FBRztZQUNkLFVBQVUsRUFBRSxVQUFVO1NBQ3ZCLENBQUMsQ0FBQztRQUVILDJEQUEyRDtRQUMzRCxNQUFNLHFCQUFxQixHQUFHLElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDbkYsS0FBSyxFQUFFLHNCQUFzQjtZQUM3QixPQUFPLEVBQUUsOEJBQThCO1lBQ3ZDLE9BQU8sRUFBRSxhQUFhLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQztnQkFDMUMsS0FBSyxFQUFFLG1CQUFtQjtnQkFDMUIsV0FBVyxFQUFFLFdBQVc7Z0JBQ3hCLE9BQU8sRUFBRSwyQkFBMkI7Z0JBQ3BDLEtBQUssRUFBRSxrQ0FBa0M7Z0JBQ3pDLFlBQVksRUFBRSxhQUFhLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUM7Z0JBQzlELFdBQVcsRUFBRSxhQUFhLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUM7Z0JBQ3RELGFBQWEsRUFBRSxhQUFhLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQztnQkFDbkUsU0FBUyxFQUFFLGFBQWEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDO2dCQUNsRSxlQUFlLEVBQUUsYUFBYSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLENBQUM7Z0JBQ3hFLE1BQU0sRUFBRSxXQUFXO2FBQ3BCLENBQUM7U0FDSCxDQUFDLENBQUM7UUFFSCxrQ0FBa0M7UUFDbEMsTUFBTSx3QkFBd0IsR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLHFCQUFxQixFQUFFO1lBQzNFLE1BQU0sRUFBRSxDQUFDLG1CQUFtQixDQUFDO1lBQzdCLFVBQVUsRUFBRSxTQUFTO1NBQ3RCLENBQUMsQ0FBQztRQUVILGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDO1FBRTlFLGdCQUFnQjtRQUNoQixNQUFNLFlBQVksR0FBRyxJQUFJLGFBQWEsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFFM0UsMkJBQTJCO1FBQzNCLE1BQU0sVUFBVSxHQUFHLGlCQUFpQjthQUNqQyxJQUFJLENBQUMsV0FBVzthQUNkLElBQUksQ0FBQyxZQUFZO2FBQ2YsU0FBUyxDQUFDLGdCQUFnQjthQUN4QixJQUFJLENBQUMsWUFBWSxDQUFDLENBQ3BCLENBQ0YsQ0FDRixDQUFDO1FBRUosTUFBTSxZQUFZLEdBQUcsSUFBSSxhQUFhLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUNwRixnQkFBZ0IsRUFBRSx3QkFBd0IsV0FBVyxFQUFFO1lBQ3ZELFVBQVUsRUFBRSxVQUFVO1lBQ3RCLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7U0FDbEMsQ0FBQyxDQUFDO1FBRUgsNERBQTREO1FBQzVELE1BQU0sWUFBWSxHQUFHLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDakUsUUFBUSxFQUFFLDBCQUEwQixXQUFXLEVBQUU7WUFDakQsUUFBUSxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JELDRDQUE0QztZQUM1Qyx3REFBd0Q7WUFDeEQsd0VBQXdFO1lBQ3hFLE9BQU8sRUFBRTtnQkFDUCxJQUFJLE9BQU8sQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDO2FBQzFDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsOEVBQThFO1FBRTlFLHlCQUF5QjtRQUN6QixNQUFNLFlBQVksR0FBRyxJQUFJLFlBQVksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNqRCxNQUFNLFdBQVcsR0FBRyxJQUFJLFlBQVksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUVoRCx1Q0FBdUM7UUFDdkMsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQzdFLFVBQVUsRUFBRSw2QkFBNkIsV0FBVyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFO1lBQzVFLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDeEMsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QixTQUFTLEVBQUUsSUFBSTtZQUNmLFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtTQUMzQyxDQUFDLENBQUM7UUFFSCxNQUFNLFlBQVksR0FBRyxJQUFJLFNBQVMsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN2RSxXQUFXLEVBQUUsd0JBQXdCLFdBQVcsRUFBRTtZQUNsRCxXQUFXLEVBQUU7Z0JBQ1gsVUFBVSxFQUFFLFNBQVMsQ0FBQyxlQUFlLENBQUMsWUFBWTtnQkFDbEQsV0FBVyxFQUFFLFNBQVMsQ0FBQyxXQUFXLENBQUMsS0FBSzthQUN6QztZQUNELFNBQVMsRUFBRSxTQUFTLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQztnQkFDeEMsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsTUFBTSxFQUFFO29CQUNOLE9BQU8sRUFBRTt3QkFDUCxrQkFBa0IsRUFBRTs0QkFDbEIsTUFBTSxFQUFFLElBQUk7eUJBQ2I7d0JBQ0QsUUFBUSxFQUFFOzRCQUNSLHdCQUF3Qjs0QkFDeEIsUUFBUTt5QkFDVDtxQkFDRjtvQkFDRCxTQUFTLEVBQUU7d0JBQ1QsUUFBUSxFQUFFOzRCQUNSLFdBQVc7eUJBQ1o7cUJBQ0Y7b0JBQ0QsS0FBSyxFQUFFO3dCQUNMLFFBQVEsRUFBRTs0QkFDUixxQ0FBcUM7eUJBQ3RDO3FCQUNGO2lCQUNGO2FBQ0YsQ0FBQztTQUNILENBQUMsQ0FBQztRQUVILDRDQUE0QztRQUM1QyxZQUFZLENBQUMsZUFBZSxDQUFDLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUNuRCxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRSxDQUFDLEdBQUcsQ0FBQztZQUNkLFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQztTQUNqQixDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sUUFBUSxHQUFHLElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQzNELFlBQVksRUFBRSxrQ0FBa0MsV0FBVyxFQUFFO1lBQzdELGNBQWMsRUFBRSx1QkFBdUI7WUFDdkMsTUFBTSxFQUFFO2dCQUNOO29CQUNFLFNBQVMsRUFBRSxRQUFRO29CQUNuQixPQUFPLEVBQUU7d0JBQ1AsZ0VBQWdFO3dCQUNoRSxtQkFBbUIsQ0FBQyxDQUFDOzRCQUNuQixJQUFJLG1CQUFtQixDQUFDLCtCQUErQixDQUFDO2dDQUN0RCxVQUFVLEVBQUUsZUFBZTtnQ0FDM0IsS0FBSyxFQUFFLFFBQVE7Z0NBQ2YsSUFBSSxFQUFFLGFBQWE7Z0NBQ25CLE1BQU0sRUFBRSxRQUFRO2dDQUNoQixNQUFNLEVBQUUsWUFBWTtnQ0FDcEIsYUFBYSxFQUFFLG1CQUFtQjs2QkFDbkMsQ0FBQyxDQUFDLENBQUM7NEJBQ0osSUFBSSxtQkFBbUIsQ0FBQyxrQkFBa0IsQ0FBQztnQ0FDekMsVUFBVSxFQUFFLGVBQWU7Z0NBQzNCLEtBQUssRUFBRSxRQUFRO2dDQUNmLElBQUksRUFBRSxhQUFhO2dDQUNuQixVQUFVLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLFdBQVcsRUFBRSxDQUFDO2dDQUNoRixNQUFNLEVBQUUsWUFBWTtnQ0FDcEIsTUFBTSxFQUFFLFFBQVE7Z0NBQ2hCLE9BQU8sRUFBRSxtQkFBbUIsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFFLGtDQUFrQzs2QkFDcEYsQ0FBQztxQkFDTDtpQkFDRjtnQkFDRDtvQkFDRSxTQUFTLEVBQUUsT0FBTztvQkFDbEIsT0FBTyxFQUFFO3dCQUNQLElBQUksbUJBQW1CLENBQUMsZUFBZSxDQUFDOzRCQUN0QyxVQUFVLEVBQUUsV0FBVzs0QkFDdkIsT0FBTyxFQUFFLFlBQVk7NEJBQ3JCLEtBQUssRUFBRSxZQUFZOzRCQUNuQixPQUFPLEVBQUUsQ0FBQyxXQUFXLENBQUM7eUJBQ3ZCLENBQUM7cUJBQ0g7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILFVBQVU7UUFDVixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyQyxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUc7WUFDZCxXQUFXLEVBQUUsMEJBQTBCO1NBQ3hDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDaEQsS0FBSyxFQUFFLGtCQUFrQixDQUFDLFVBQVU7WUFDcEMsV0FBVyxFQUFFLGtDQUFrQztTQUNoRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3pDLEtBQUssRUFBRSxXQUFXLENBQUMsU0FBUztZQUM1QixXQUFXLEVBQUUsZ0NBQWdDO1NBQzlDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDekMsS0FBSyxFQUFFLFlBQVksQ0FBQyxlQUFlO1lBQ25DLFdBQVcsRUFBRSxrQ0FBa0M7U0FDaEQsQ0FBQyxDQUFDO1FBRUgsbUJBQW1CO1FBQ25CLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3RDLEtBQUssRUFBRSxRQUFRLENBQUMsWUFBWTtZQUM1QixXQUFXLEVBQUUsdUJBQXVCO1NBQ3JDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxXQUFXO1lBQy9CLFdBQVcsRUFBRSx3QkFBd0I7U0FDdEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUsbUJBQW1CLElBQUksb0RBQW9EO1lBQ2xGLFdBQVcsRUFBRSwwQkFBMEI7U0FDeEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRTtZQUNyRCxLQUFLLEVBQUUsdUJBQXVCLENBQUMsVUFBVTtZQUN6QyxXQUFXLEVBQUUsdUNBQXVDO1NBQ3JELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXBlRCw0REFvZUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIHN0ZXBmdW5jdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXN0ZXBmdW5jdGlvbnMnO1xuaW1wb3J0ICogYXMgc2ZuVGFza3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLXN0ZXBmdW5jdGlvbnMtdGFza3MnO1xuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgY29kZXBpcGVsaW5lIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlcGlwZWxpbmUnO1xuaW1wb3J0ICogYXMgY29kZXBpcGVsaW5lQWN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZXBpcGVsaW5lLWFjdGlvbnMnO1xuaW1wb3J0ICogYXMgY29kZWJ1aWxkIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlYnVpbGQnO1xuaW1wb3J0ICogYXMgc2VjcmV0c21hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlY3JldHNtYW5hZ2VyJztcbmltcG9ydCAqIGFzIHNuc1N1YnNjcmlwdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucy1zdWJzY3JpcHRpb25zJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVudHJpeEVuZXJneUF1Y3Rpb25TdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICBnaXRodWJDb25uZWN0aW9uQXJuPzogc3RyaW5nOyAvLyBPcHRpb25hbDogR2l0SHViIGNvbm5lY3Rpb24gQVJOIGZvciBDSS9DRFxuICBcbiAgLy8gT1BUSU9OQUwgUFJPUFMgRk9SIE1VTFRJUExFIEVOVklST05NRU5UUyAoQ09NTUVOVEVEKVxuICAvLyBVbmNvbW1lbnQgdG8gZW5hYmxlIGVudmlyb25tZW50LXNwZWNpZmljIGNvbmZpZ3VyYXRpb25zXG4gIC8vIHNjaGVkdWxlRHVyYXRpb24/OiBudW1iZXI7ICAvLyBQaXBlbGluZSBzY2hlZHVsZSBpbiBob3Vyc1xuICAvLyByZXRlbnRpb25EYXlzPzogbnVtYmVyOyAgICAgLy8gTG9nIHJldGVudGlvbiBkYXlzXG59XG5cbmV4cG9ydCBjbGFzcyBFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRW50cml4RW5lcmd5QXVjdGlvblN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQsIGdpdGh1YkNvbm5lY3Rpb25Bcm4gfSA9IHByb3BzO1xuICAgIFxuICAgIC8vIEVOVklST05NRU5ULVNQRUNJRklDIENPTkZJR1VSQVRJT05TIChDT01NRU5URUQpXG4gICAgLy8gVW5jb21tZW50IHRvIHVzZSBlbnZpcm9ubWVudC1zcGVjaWZpYyBzZXR0aW5nc1xuICAgIC8vIGNvbnN0IHNjaGVkdWxlRHVyYXRpb24gPSBwcm9wcy5zY2hlZHVsZUR1cmF0aW9uID8/IDE7ICAvLyBEZWZhdWx0IDEgaG91clxuICAgIC8vIGNvbnN0IHJldGVudGlvbkRheXMgPSBwcm9wcy5yZXRlbnRpb25EYXlzID8/IDc7ICAgICAgICAvLyBEZWZhdWx0IDcgZGF5c1xuXG4gICAgLy8gUzMgQnVja2V0IGZvciBvcmRlciByZXN1bHRzXG4gICAgY29uc3Qgb3JkZXJSZXN1bHRzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnT3JkZXJSZXN1bHRzQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYGVudHJpeC1vcmRlci1yZXN1bHRzLSR7ZW52aXJvbm1lbnR9LSR7Y2RrLkF3cy5BQ0NPVU5UX0lEfWAsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRURcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIHRhYmxlIGZvciBvcmRlcnMgd2l0aCAyNC1ob3VyIFRUTFxuICAgIGNvbnN0IG9yZGVyc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdPcmRlcnNUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogYGVudHJpeC1vcmRlcnMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdyZWNvcmRfaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHRpbWVUb0xpdmVBdHRyaWJ1dGU6ICd0dGwnLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgIH0pO1xuXG4gICAgLy8gU05TIFRvcGljIGZvciBlcnJvciBub3RpZmljYXRpb25zXG4gICAgY29uc3QgZXJyb3JOb3RpZmljYXRpb25Ub3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ0Vycm9yTm90aWZpY2F0aW9uVG9waWMnLCB7XG4gICAgICB0b3BpY05hbWU6IGBlcnJvci1ub3RpZmljYXRpb25zLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGRpc3BsYXlOYW1lOiAnRXJyb3IgTm90aWZpY2F0aW9ucyBmb3IgRW5lcmd5IEF1Y3Rpb24gSXNzdWVzJ1xuICAgIH0pO1xuXG4gICAgLy8gV2UnbGwgaGFuZGxlIER5bmFtb0RCIGRlY2ltYWwgY29udmVyc2lvbiB2aWEgZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgLy8gVGhlIExhbWJkYSBjb2RlIGNhbiBjaGVjayBmb3IgRFlOQU1PREJfRkxPQVRfU0VSSUFMSVpFUiBlbnYgdmFyXG5cbiAgICAvLyBMYW1iZGEgRnVuY3Rpb25zXG4gICAgXG4gICAgLy8gUE9TVCBMYW1iZGEgZm9yIEFQSVxuICAgIGNvbnN0IHBvc3RMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdFbnRyaXhQb3N0TGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOSxcbiAgICAgIGhhbmRsZXI6ICdhcHAubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdzcmMvcG9zdF9sYW1iZGEnKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFRBQkxFX05BTUU6IG9yZGVyc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgRFlOQU1PREJfRkxPQVRfU0VSSUFMSVpFUjogJ3VzZV9kZWNpbWFsJyAvLyBDb25maWd1cmUgZmxvYXQgaGFuZGxpbmcgdmlhIGVudiB2YXJcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMClcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBBIC0gUmVzdWx0cyBnZW5lcmF0b3JcbiAgICBjb25zdCBsYW1iZGFBID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnTGFtYmRhQScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnYXBwLmxhbWJkYV9oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnc3JjL2xhbWJkYV9hJyksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMClcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBCIC0gT3JkZXIgcHJvY2Vzc29yXG4gICAgY29uc3QgbGFtYmRhQiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0xhbWJkYUInLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgaGFuZGxlcjogJ2FwcC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ3NyYy9sYW1iZGFfYicsIHtcbiAgICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgICBpbWFnZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOS5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAgICdiYXNoJywgJy1jJyxcbiAgICAgICAgICAgICdwaXAgaW5zdGFsbCAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLWF1IC4gL2Fzc2V0LW91dHB1dCdcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBMT0dfQlVDS0VUOiBvcmRlclJlc3VsdHNCdWNrZXQuYnVja2V0TmFtZVxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKVxuICAgIH0pO1xuXG4gICAgLy8gU2xhY2sgTm90aWZpY2F0aW9uIExhbWJkYSAoc3Vic2NyaWJlcyB0byBTTlMgZm9yIGVycm9yIGFsZXJ0cylcbiAgICBjb25zdCBzbGFja05vdGlmaWNhdGlvbkxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1NsYWNrTm90aWZpY2F0aW9uTGFtYmRhJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCBqc29uXG5pbXBvcnQgdXJsbGliM1xuaW1wb3J0IG9zXG5cbmRlZiBsYW1iZGFfaGFuZGxlcihldmVudCwgY29udGV4dCk6XG4gICAgXCJcIlwiXG4gICAgUHJvY2VzcyBTTlMgbm90aWZpY2F0aW9uIGFuZCBzZW5kIGZvcm1hdHRlZCBtZXNzYWdlIHRvIFNsYWNrXG4gICAgXCJcIlwiXG4gICAgIyBQYXJzZSBTTlMgbWVzc2FnZVxuICAgIHNuc19tZXNzYWdlID0ganNvbi5sb2FkcyhldmVudFsnUmVjb3JkcyddWzBdWydTbnMnXVsnTWVzc2FnZSddKVxuICAgIFxuICAgICMgR2V0IFNsYWNrIHdlYmhvb2sgVVJMIGZyb20gZW52aXJvbm1lbnQgKHdvdWxkIGJlIHNldCBpbiByZWFsIGRlcGxveW1lbnQpXG4gICAgc2xhY2tfd2ViaG9va191cmwgPSBvcy5lbnZpcm9uLmdldCgnU0xBQ0tfV0VCSE9PS19VUkwnLCAnaHR0cHM6Ly9ob29rcy5zbGFjay5jb20vc2VydmljZXMvWU9VUi9TTEFDSy9XRUJIT09LJylcbiAgICBcbiAgICAjIEZvcm1hdCBTbGFjayBtZXNzYWdlXG4gICAgc2xhY2tfcGF5bG9hZCA9IHtcbiAgICAgICAgXCJ0ZXh0XCI6IGZcIvCfmqggKntzbnNfbWVzc2FnZS5nZXQoJ2FsZXJ0JywgJ0Vycm9yIEFsZXJ0Jyl9KlwiLFxuICAgICAgICBcImJsb2Nrc1wiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiaGVhZGVyXCIsXG4gICAgICAgICAgICAgICAgXCJ0ZXh0XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwicGxhaW5fdGV4dFwiLFxuICAgICAgICAgICAgICAgICAgICBcInRleHRcIjogZlwi8J+aqCB7c25zX21lc3NhZ2UuZ2V0KCdzZXJ2aWNlJywgJ1NlcnZpY2UnKX0gQWxlcnRcIlxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic2VjdGlvblwiLFxuICAgICAgICAgICAgICAgIFwiZmllbGRzXCI6IFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwibXJrZHduXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInRleHRcIjogZlwiKkVudmlyb25tZW50OipcXFxcbntzbnNfbWVzc2FnZS5nZXQoJ2Vudmlyb25tZW50JywgJ3Vua25vd24nKX1cIlxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJtcmtkd25cIiwgXG4gICAgICAgICAgICAgICAgICAgICAgICBcInRleHRcIjogZlwiKkVycm9yOipcXFxcbntzbnNfbWVzc2FnZS5nZXQoJ2Vycm9yJywgJ1Vua25vd24gZXJyb3InKX1cIlxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJtcmtkd25cIixcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidGV4dFwiOiBmXCIqRXhlY3V0aW9uOipcXFxcbntzbnNfbWVzc2FnZS5nZXQoJ2V4ZWN1dGlvbk5hbWUnLCAnTi9BJyl9XCJcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwibXJrZHduXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInRleHRcIjogZlwiKlRpbWVzdGFtcDoqXFxcXG57c25zX21lc3NhZ2UuZ2V0KCd0aW1lc3RhbXAnLCAnTi9BJyl9XCJcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwic2VjdGlvblwiLFxuICAgICAgICAgICAgICAgIFwidGV4dFwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcIm1ya2R3blwiLFxuICAgICAgICAgICAgICAgICAgICBcInRleHRcIjogZlwiKkVycm9yIERldGFpbHM6KlxcXFxuXFxgXFxgXFxge3Nuc19tZXNzYWdlLmdldCgnZXJyb3JEZXRhaWxzJywgJ05vIGRldGFpbHMgYXZhaWxhYmxlJyl9XFxgXFxgXFxgXCJcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImNvbnRleHRcIixcbiAgICAgICAgICAgICAgICBcImVsZW1lbnRzXCI6IFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwibXJrZHduXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInRleHRcIjogZlwiUmVnaW9uOiB7c25zX21lc3NhZ2UuZ2V0KCdyZWdpb24nLCAnTi9BJyl9IHwgU3RhdGUgTWFjaGluZToge3Nuc19tZXNzYWdlLmdldCgnc3RhdGVNYWNoaW5lQXJuJywgJ04vQScpfVwiXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9XG4gICAgXG4gICAgIyBTZW5kIHRvIFNsYWNrIChpbiBwcm9kdWN0aW9uLCB5b3UnZCB1c2UgdGhlIGFjdHVhbCB3ZWJob29rKVxuICAgIGh0dHAgPSB1cmxsaWIzLlBvb2xNYW5hZ2VyKClcbiAgICBcbiAgICB0cnk6XG4gICAgICAgIHJlc3BvbnNlID0gaHR0cC5yZXF1ZXN0KFxuICAgICAgICAgICAgJ1BPU1QnLFxuICAgICAgICAgICAgc2xhY2tfd2ViaG9va191cmwsXG4gICAgICAgICAgICBib2R5PWpzb24uZHVtcHMoc2xhY2tfcGF5bG9hZCksXG4gICAgICAgICAgICBoZWFkZXJzPXsnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nfVxuICAgICAgICApXG4gICAgICAgIFxuICAgICAgICBwcmludChmXCJTbGFjayBub3RpZmljYXRpb24gc2VudCBzdWNjZXNzZnVsbHkuIFN0YXR1czoge3Jlc3BvbnNlLnN0YXR1c31cIilcbiAgICAgICAgcHJpbnQoZlwiUGF5bG9hZDoge2pzb24uZHVtcHMoc2xhY2tfcGF5bG9hZCwgaW5kZW50PTIpfVwiKVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogMjAwLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHtcbiAgICAgICAgICAgICAgICAnbWVzc2FnZSc6ICdOb3RpZmljYXRpb24gc2VudCBzdWNjZXNzZnVsbHknLFxuICAgICAgICAgICAgICAgICdzbGFja19yZXNwb25zZV9zdGF0dXMnOiByZXNwb25zZS5zdGF0dXNcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOlxuICAgICAgICBwcmludChmXCJGYWlsZWQgdG8gc2VuZCBTbGFjayBub3RpZmljYXRpb246IHtzdHIoZSl9XCIpXG4gICAgICAgIHByaW50KGZcIldvdWxkIGhhdmUgc2VudDoge2pzb24uZHVtcHMoc2xhY2tfcGF5bG9hZCwgaW5kZW50PTIpfVwiKVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNTAwLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHtcbiAgICAgICAgICAgICAgICAnZXJyb3InOiAnRmFpbGVkIHRvIHNlbmQgbm90aWZpY2F0aW9uJyxcbiAgICAgICAgICAgICAgICAnZGV0YWlscyc6IHN0cihlKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgYCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAnU0xBQ0tfV0VCSE9PS19VUkwnOiAnaHR0cHM6Ly9ob29rcy5zbGFjay5jb20vc2VydmljZXMvWU9VUi9TTEFDSy9XRUJIT09LJyAvLyBSZXBsYWNlIHdpdGggYWN0dWFsIHdlYmhvb2tcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlbmRzIGZvcm1hdHRlZCBlcnJvciBub3RpZmljYXRpb25zIHRvIFNsYWNrIGNoYW5uZWwnXG4gICAgfSk7XG5cbiAgICAvLyBTdWJzY3JpYmUgU2xhY2sgTGFtYmRhIHRvIFNOUyB0b3BpY1xuICAgIGVycm9yTm90aWZpY2F0aW9uVG9waWMuYWRkU3Vic2NyaXB0aW9uKFxuICAgICAgbmV3IHNuc1N1YnNjcmlwdGlvbnMuTGFtYmRhU3Vic2NyaXB0aW9uKHNsYWNrTm90aWZpY2F0aW9uTGFtYmRhKVxuICAgICk7XG5cbiAgICAvLyBBZGQgZW1haWwgc3Vic2NyaXB0aW9uIGZvciBjcml0aWNhbCBhbGVydHMgKHJlcGxhY2Ugd2l0aCBhY3R1YWwgZW1haWwpXG4gICAgZXJyb3JOb3RpZmljYXRpb25Ub3BpYy5hZGRTdWJzY3JpcHRpb24oXG4gICAgICBuZXcgc25zU3Vic2NyaXB0aW9ucy5FbWFpbFN1YnNjcmlwdGlvbignZGV2b3BzLXRlYW1AY29tcGFueS5jb20nKVxuICAgICk7XG5cbiAgICAvLyBPcHRpb25hbDogQWRkIFNNUyBzdWJzY3JpcHRpb24gZm9yIHVyZ2VudCBhbGVydHNcbiAgICAvLyBlcnJvck5vdGlmaWNhdGlvblRvcGljLmFkZFN1YnNjcmlwdGlvbihcbiAgICAvLyAgIG5ldyBzbnNTdWJzY3JpcHRpb25zLlNtc1N1YnNjcmlwdGlvbignKzEyMzQ1Njc4OTAnKVxuICAgIC8vICk7XG5cblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zXG4gICAgb3JkZXJzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHBvc3RMYW1iZGEpO1xuICAgIG9yZGVyUmVzdWx0c0J1Y2tldC5ncmFudFJlYWRXcml0ZShsYW1iZGFCKTtcblxuICAgIC8vIEFQSSBHYXRld2F5XG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnRW5lcmd5QXVjdGlvbkFwaScsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiBgZW50cml4LWVuZXJneS1hdWN0aW9uLWFwaS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBmb3IgZW5lcmd5IGF1Y3Rpb24gb3JkZXJzJyxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBlbnZpcm9ubWVudFxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3Qgb3JkZXJzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnb3JkZXJzJyk7XG4gICAgb3JkZXJzUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocG9zdExhbWJkYSkpO1xuXG4gICAgLy8gU3RlcCBGdW5jdGlvbnMgU3RhdGUgTWFjaGluZSBmb3IgZGF0YSBwaXBlbGluZVxuICAgIFxuICAgIC8vIExhbWJkYSBBIHRhc2sgd2l0aCByZXRyeSBjb25maWd1cmF0aW9uXG4gICAgY29uc3QgbGFtYmRhQVRhc2sgPSBuZXcgc2ZuVGFza3MuTGFtYmRhSW52b2tlKHRoaXMsICdJbnZva2VMYW1iZGFBJywge1xuICAgICAgbGFtYmRhRnVuY3Rpb246IGxhbWJkYUEsXG4gICAgICBvdXRwdXRQYXRoOiAnJC5QYXlsb2FkJyxcbiAgICAgIHJldHJ5T25TZXJ2aWNlRXhjZXB0aW9uczogdHJ1ZSxcbiAgICAgIHBheWxvYWQ6IHN0ZXBmdW5jdGlvbnMuVGFza0lucHV0LmZyb21PYmplY3Qoe1xuICAgICAgICBcImF0dGVtcHQuJFwiOiBcIiQuYXR0ZW1wdFwiLFxuICAgICAgICBcImlucHV0LiRcIjogXCIkXCJcbiAgICAgIH0pXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgYXR0ZW1wdCBjb3VudGVyIGluaXRpYWxpemF0aW9uXG4gICAgY29uc3QgaW5pdGlhbGl6ZUF0dGVtcHQgPSBuZXcgc3RlcGZ1bmN0aW9ucy5QYXNzKHRoaXMsICdJbml0aWFsaXplQXR0ZW1wdCcsIHtcbiAgICAgIHJlc3VsdDogc3RlcGZ1bmN0aW9ucy5SZXN1bHQuZnJvbU9iamVjdCh7IGF0dGVtcHQ6IDEgfSksXG4gICAgICByZXN1bHRQYXRoOiAnJC5hdHRlbXB0J1xuICAgIH0pO1xuXG4gICAgLy8gSW5jcmVtZW50IGF0dGVtcHQgY291bnRlclxuICAgIGNvbnN0IGluY3JlbWVudEF0dGVtcHQgPSBuZXcgc3RlcGZ1bmN0aW9ucy5QYXNzKHRoaXMsICdJbmNyZW1lbnRBdHRlbXB0Jywge1xuICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICBcImF0dGVtcHQuJFwiOiBcIlN0YXRlcy5NYXRoQWRkKCQuYXR0ZW1wdCwgMSlcIixcbiAgICAgICAgXCJpbnB1dC4kXCI6IFwiJFwiXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDaGVjayBtYXggcmV0cmllc1xuICAgIGNvbnN0IG1heFJldHJ5Q2hlY2sgPSBuZXcgc3RlcGZ1bmN0aW9ucy5DaG9pY2UodGhpcywgJ0NoZWNrTWF4UmV0cmllcycpXG4gICAgICAud2hlbihcbiAgICAgICAgc3RlcGZ1bmN0aW9ucy5Db25kaXRpb24ubnVtYmVyR3JlYXRlclRoYW4oJyQuYXR0ZW1wdCcsIDUpLFxuICAgICAgICBuZXcgc3RlcGZ1bmN0aW9ucy5GYWlsKHRoaXMsICdNYXhSZXRyaWVzRXhjZWVkZWQnLCB7XG4gICAgICAgICAgZXJyb3I6ICdMYW1iZGFBTWF4UmV0cmllcycsXG4gICAgICAgICAgY2F1c2U6ICdMYW1iZGEgQSBmYWlsZWQgdG8gcmV0dXJuIHRydWUgcmVzdWx0cyBhZnRlciA1IGF0dGVtcHRzJ1xuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIC8vIENob2ljZSBzdGF0ZSB0byBjaGVjayByZXN1bHRzXG4gICAgY29uc3QgY2hlY2tSZXN1bHRzID0gbmV3IHN0ZXBmdW5jdGlvbnMuQ2hvaWNlKHRoaXMsICdDaGVja1Jlc3VsdHMnKVxuICAgICAgLndoZW4oXG4gICAgICAgIHN0ZXBmdW5jdGlvbnMuQ29uZGl0aW9uLmJvb2xlYW5FcXVhbHMoJyQucmVzdWx0cycsIGZhbHNlKSxcbiAgICAgICAgaW5jcmVtZW50QXR0ZW1wdC5uZXh0KG1heFJldHJ5Q2hlY2sub3RoZXJ3aXNlKGxhbWJkYUFUYXNrKSlcbiAgICAgICk7XG5cbiAgICAvLyBNYXAgc3RhdGUgdG8gcHJvY2VzcyBlYWNoIG9yZGVyXG4gICAgY29uc3QgcHJvY2Vzc09yZGVyc01hcCA9IG5ldyBzdGVwZnVuY3Rpb25zLk1hcCh0aGlzLCAnUHJvY2Vzc09yZGVycycsIHtcbiAgICAgIGl0ZW1zUGF0aDogJyQub3JkZXJzJyxcbiAgICAgIG1heENvbmN1cnJlbmN5OiAxMFxuICAgIH0pO1xuXG4gICAgLy8gRGF0YSB0cmFuc2Zvcm1hdGlvbiBmb3IgTGFtYmRhIEIgY29tcGF0aWJpbGl0eVxuICAgIGNvbnN0IHRyYW5zZm9ybUZvckxhbWJkYUIgPSBuZXcgc3RlcGZ1bmN0aW9ucy5QYXNzKHRoaXMsICdUcmFuc2Zvcm1Gb3JMYW1iZGFCJywge1xuICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICBcInN0YXR1cy4kXCI6IFwiJC5vcmRlclwiLCAvLyBNYXAgJ29yZGVyJyBmaWVsZCB0byAnc3RhdHVzJyBmaWVsZCBmb3IgTGFtYmRhIEJcbiAgICAgICAgXCJpZC4kXCI6IFwiJC5pZFwiLFxuICAgICAgICBcInRpbWVzdGFtcC4kXCI6IFwiJC50aW1lc3RhbXBcIixcbiAgICAgICAgXCJkYXRhLiRcIjogXCIkXCIgLy8gUGFzcyB0aHJvdWdoIGFsbCBvcmlnaW5hbCBkYXRhXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgQiB0YXNrIHdpdGggZXJyb3IgaGFuZGxpbmdcbiAgICBjb25zdCBsYW1iZGFCVGFzayA9IG5ldyBzZm5UYXNrcy5MYW1iZGFJbnZva2UodGhpcywgJ0ludm9rZUxhbWJkYUInLCB7XG4gICAgICBsYW1iZGFGdW5jdGlvbjogbGFtYmRhQixcbiAgICAgIGlucHV0UGF0aDogJyQnLFxuICAgICAgcmVzdWx0UGF0aDogJyQucmVzdWx0J1xuICAgIH0pO1xuXG4gICAgLy8gRW5oYW5jZWQgU05TIG5vdGlmaWNhdGlvbiBvbiBlcnJvciB3aXRoIGRldGFpbGVkIGNvbnRleHRcbiAgICBjb25zdCBzZW5kRXJyb3JOb3RpZmljYXRpb24gPSBuZXcgc2ZuVGFza3MuU25zUHVibGlzaCh0aGlzLCAnU2VuZEVycm9yTm90aWZpY2F0aW9uJywge1xuICAgICAgdG9waWM6IGVycm9yTm90aWZpY2F0aW9uVG9waWMsXG4gICAgICBzdWJqZWN0OiAn8J+aqCBMYW1iZGEgQiBQcm9jZXNzaW5nIEVycm9yJyxcbiAgICAgIG1lc3NhZ2U6IHN0ZXBmdW5jdGlvbnMuVGFza0lucHV0LmZyb21PYmplY3Qoe1xuICAgICAgICBhbGVydDogJ/CfmqggTGFtYmRhIEIgRXJyb3InLFxuICAgICAgICBlbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gICAgICAgIHNlcnZpY2U6ICdFbmVyZ3kgQXVjdGlvbiBQcm9jZXNzaW5nJyxcbiAgICAgICAgZXJyb3I6ICdMYW1iZGEgQiBmYWlsZWQgdG8gcHJvY2VzcyBvcmRlcicsXG4gICAgICAgIGVycm9yRGV0YWlsczogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5zdHJpbmdBdCgnJC5lcnJvci5FcnJvcicpLFxuICAgICAgICBmYWlsZWRPcmRlcjogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5vYmplY3RBdCgnJC5kYXRhJyksXG4gICAgICAgIGV4ZWN1dGlvbk5hbWU6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQkLkV4ZWN1dGlvbi5OYW1lJyksXG4gICAgICAgIHRpbWVzdGFtcDogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5zdHJpbmdBdCgnJCQuU3RhdGUuRW50ZXJlZFRpbWUnKSxcbiAgICAgICAgc3RhdGVNYWNoaW5lQXJuOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckJC5TdGF0ZU1hY2hpbmUuTmFtZScpLFxuICAgICAgICByZWdpb246ICdldS13ZXN0LTEnXG4gICAgICB9KVxuICAgIH0pO1xuXG4gICAgLy8gQ2F0Y2ggYmxvY2sgZm9yIExhbWJkYSBCIGVycm9yc1xuICAgIGNvbnN0IGxhbWJkYUJXaXRoRXJyb3JIYW5kbGluZyA9IGxhbWJkYUJUYXNrLmFkZENhdGNoKHNlbmRFcnJvck5vdGlmaWNhdGlvbiwge1xuICAgICAgZXJyb3JzOiBbJ1N0YXRlcy5UYXNrRmFpbGVkJ10sXG4gICAgICByZXN1bHRQYXRoOiAnJC5lcnJvcidcbiAgICB9KTtcblxuICAgIHByb2Nlc3NPcmRlcnNNYXAuaXRlcmF0b3IodHJhbnNmb3JtRm9yTGFtYmRhQi5uZXh0KGxhbWJkYUJXaXRoRXJyb3JIYW5kbGluZykpO1xuXG4gICAgLy8gU3VjY2VzcyBzdGF0ZVxuICAgIGNvbnN0IHN1Y2Nlc3NTdGF0ZSA9IG5ldyBzdGVwZnVuY3Rpb25zLlN1Y2NlZWQodGhpcywgJ1Byb2Nlc3NpbmdDb21wbGV0ZScpO1xuXG4gICAgLy8gRGVmaW5lIHRoZSBzdGF0ZSBtYWNoaW5lXG4gICAgY29uc3QgZGVmaW5pdGlvbiA9IGluaXRpYWxpemVBdHRlbXB0XG4gICAgICAubmV4dChsYW1iZGFBVGFza1xuICAgICAgICAubmV4dChjaGVja1Jlc3VsdHNcbiAgICAgICAgICAub3RoZXJ3aXNlKHByb2Nlc3NPcmRlcnNNYXBcbiAgICAgICAgICAgIC5uZXh0KHN1Y2Nlc3NTdGF0ZSlcbiAgICAgICAgICApXG4gICAgICAgIClcbiAgICAgICk7XG5cbiAgICBjb25zdCBzdGF0ZU1hY2hpbmUgPSBuZXcgc3RlcGZ1bmN0aW9ucy5TdGF0ZU1hY2hpbmUodGhpcywgJ0RhdGFQaXBlbGluZVN0YXRlTWFjaGluZScsIHtcbiAgICAgIHN0YXRlTWFjaGluZU5hbWU6IGBlbnRyaXgtZGF0YS1waXBlbGluZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZWZpbml0aW9uOiBkZWZpbml0aW9uLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpXG4gICAgfSk7XG5cbiAgICAvLyBFdmVudEJyaWRnZSBydWxlIHRvIHRyaWdnZXIgdGhlIHN0YXRlIG1hY2hpbmUgb24gc2NoZWR1bGVcbiAgICBjb25zdCBzY2hlZHVsZVJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ0RhdGFQaXBlbGluZVNjaGVkdWxlJywge1xuICAgICAgcnVsZU5hbWU6IGBkYXRhLXBpcGVsaW5lLXNjaGVkdWxlLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUucmF0ZShjZGsuRHVyYXRpb24uaG91cnMoMSkpLCAvLyBSdW4gZXZlcnkgaG91clxuICAgICAgLy8gRU5WSVJPTk1FTlQtU1BFQ0lGSUMgU0NIRURVTEUgKENPTU1FTlRFRClcbiAgICAgIC8vIFVuY29tbWVudCB0byB1c2UgZGlmZmVyZW50IHNjaGVkdWxlcyBwZXIgZW52aXJvbm1lbnQ6XG4gICAgICAvLyBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoY2RrLkR1cmF0aW9uLmhvdXJzKHNjaGVkdWxlRHVyYXRpb24pKSxcbiAgICAgIHRhcmdldHM6IFtcbiAgICAgICAgbmV3IHRhcmdldHMuU2ZuU3RhdGVNYWNoaW5lKHN0YXRlTWFjaGluZSlcbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIEdpdEh1YiBUb2tlbiBTZWNyZXQgZm9yIENvZGVQaXBlbGluZSAobWFuYWdlZCBleHRlcm5hbGx5IGJ5IEdpdEh1YiBBY3Rpb25zKVxuXG4gICAgLy8gQ29kZVBpcGVsaW5lIGZvciBDSS9DRFxuICAgIGNvbnN0IHNvdXJjZU91dHB1dCA9IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoKTtcbiAgICBjb25zdCBidWlsZE91dHB1dCA9IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoKTtcblxuICAgIC8vIFMzIEJ1Y2tldCBmb3IgQ29kZVBpcGVsaW5lIGFydGlmYWN0c1xuICAgIGNvbnN0IHBpcGVsaW5lQXJ0aWZhY3RzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnUGlwZWxpbmVBcnRpZmFjdHNCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgZW50cml4LXBpcGVsaW5lLWFydGlmYWN0cy0ke2Vudmlyb25tZW50fS0ke2Nkay5Bd3MuQUNDT1VOVF9JRH1gLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VEXG4gICAgfSk7XG5cbiAgICBjb25zdCBidWlsZFByb2plY3QgPSBuZXcgY29kZWJ1aWxkLlBpcGVsaW5lUHJvamVjdCh0aGlzLCAnQnVpbGRQcm9qZWN0Jywge1xuICAgICAgcHJvamVjdE5hbWU6IGBlbmVyZ3ktYXVjdGlvbi1idWlsZC0ke2Vudmlyb25tZW50fWAsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBidWlsZEltYWdlOiBjb2RlYnVpbGQuTGludXhCdWlsZEltYWdlLlNUQU5EQVJEXzVfMCxcbiAgICAgICAgY29tcHV0ZVR5cGU6IGNvZGVidWlsZC5Db21wdXRlVHlwZS5TTUFMTFxuICAgICAgfSxcbiAgICAgIGJ1aWxkU3BlYzogY29kZWJ1aWxkLkJ1aWxkU3BlYy5mcm9tT2JqZWN0KHtcbiAgICAgICAgdmVyc2lvbjogJzAuMicsXG4gICAgICAgIHBoYXNlczoge1xuICAgICAgICAgIGluc3RhbGw6IHtcbiAgICAgICAgICAgICdydW50aW1lLXZlcnNpb25zJzoge1xuICAgICAgICAgICAgICBub2RlanM6ICcxOCdcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAnbnBtIGluc3RhbGwgLWcgYXdzLWNkaycsXG4gICAgICAgICAgICAgICducG0gY2knXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSxcbiAgICAgICAgICBwcmVfYnVpbGQ6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICdjZGsgc3ludGgnXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSxcbiAgICAgICAgICBidWlsZDoge1xuICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgJ2NkayBkZXBsb3kgLS1yZXF1aXJlLWFwcHJvdmFsIG5ldmVyJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IENvZGVCdWlsZCBwZXJtaXNzaW9ucyB0byBkZXBsb3kgQ0RLXG4gICAgYnVpbGRQcm9qZWN0LmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbJyonXSxcbiAgICAgIHJlc291cmNlczogWycqJ11cbiAgICB9KSk7XG5cbiAgICBjb25zdCBwaXBlbGluZSA9IG5ldyBjb2RlcGlwZWxpbmUuUGlwZWxpbmUodGhpcywgJ1BpcGVsaW5lJywge1xuICAgICAgcGlwZWxpbmVOYW1lOiBgZW50cml4LWVuZXJneS1hdWN0aW9uLXBpcGVsaW5lLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGFydGlmYWN0QnVja2V0OiBwaXBlbGluZUFydGlmYWN0c0J1Y2tldCxcbiAgICAgIHN0YWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnU291cmNlJyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAvLyBVc2UgR2l0SHViIENvbm5lY3Rpb24gaWYgcHJvdmlkZWQsIG90aGVyd2lzZSB1c2UgR2l0SHViIE9BdXRoXG4gICAgICAgICAgICBnaXRodWJDb25uZWN0aW9uQXJuID8gXG4gICAgICAgICAgICAgIG5ldyBjb2RlcGlwZWxpbmVBY3Rpb25zLkNvZGVTdGFyQ29ubmVjdGlvbnNTb3VyY2VBY3Rpb24oe1xuICAgICAgICAgICAgICAgIGFjdGlvbk5hbWU6ICdHaXRIdWJfU291cmNlJyxcbiAgICAgICAgICAgICAgICBvd25lcjogJ2RldmQtcycsXG4gICAgICAgICAgICAgICAgcmVwbzogJ2VudHJpeC10YXNrJyxcbiAgICAgICAgICAgICAgICBicmFuY2g6ICdtYXN0ZXInLFxuICAgICAgICAgICAgICAgIG91dHB1dDogc291cmNlT3V0cHV0LFxuICAgICAgICAgICAgICAgIGNvbm5lY3Rpb25Bcm46IGdpdGh1YkNvbm5lY3Rpb25Bcm4sXG4gICAgICAgICAgICAgIH0pIDpcbiAgICAgICAgICAgICAgbmV3IGNvZGVwaXBlbGluZUFjdGlvbnMuR2l0SHViU291cmNlQWN0aW9uKHtcbiAgICAgICAgICAgICAgICBhY3Rpb25OYW1lOiAnR2l0SHViX1NvdXJjZScsXG4gICAgICAgICAgICAgICAgb3duZXI6ICdkZXZkLXMnLCBcbiAgICAgICAgICAgICAgICByZXBvOiAnZW50cml4LXRhc2snLFxuICAgICAgICAgICAgICAgIG9hdXRoVG9rZW46IGNkay5TZWNyZXRWYWx1ZS5zZWNyZXRzTWFuYWdlcihgZW50cml4LWdpdGh1Yi10b2tlbi0ke2Vudmlyb25tZW50fWApLFxuICAgICAgICAgICAgICAgIG91dHB1dDogc291cmNlT3V0cHV0LFxuICAgICAgICAgICAgICAgIGJyYW5jaDogJ21hc3RlcicsXG4gICAgICAgICAgICAgICAgdHJpZ2dlcjogY29kZXBpcGVsaW5lQWN0aW9ucy5HaXRIdWJUcmlnZ2VyLlBPTEwgIC8vIFVzZSBwb2xsaW5nIGluc3RlYWQgb2Ygd2ViaG9va3NcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdGFnZU5hbWU6ICdCdWlsZCcsXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgbmV3IGNvZGVwaXBlbGluZUFjdGlvbnMuQ29kZUJ1aWxkQWN0aW9uKHtcbiAgICAgICAgICAgICAgYWN0aW9uTmFtZTogJ0NvZGVCdWlsZCcsXG4gICAgICAgICAgICAgIHByb2plY3Q6IGJ1aWxkUHJvamVjdCxcbiAgICAgICAgICAgICAgaW5wdXQ6IHNvdXJjZU91dHB1dCxcbiAgICAgICAgICAgICAgb3V0cHV0czogW2J1aWxkT3V0cHV0XVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgZW5kcG9pbnQgVVJMJ1xuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ09yZGVyUmVzdWx0c0J1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogb3JkZXJSZXN1bHRzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIGJ1Y2tldCBuYW1lIGZvciBvcmRlciByZXN1bHRzJ1xuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ09yZGVyc1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBvcmRlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWUgZm9yIG9yZGVycydcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdGF0ZU1hY2hpbmVBcm4nLCB7XG4gICAgICB2YWx1ZTogc3RhdGVNYWNoaW5lLnN0YXRlTWFjaGluZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3RlcCBGdW5jdGlvbnMgc3RhdGUgbWFjaGluZSBBUk4nXG4gICAgfSk7XG5cbiAgICAvLyBQaXBlbGluZSBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1BpcGVsaW5lTmFtZScsIHtcbiAgICAgIHZhbHVlOiBwaXBlbGluZS5waXBlbGluZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FXUyBDb2RlUGlwZWxpbmUgbmFtZSdcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCdWlsZFByb2plY3ROYW1lJywge1xuICAgICAgdmFsdWU6IGJ1aWxkUHJvamVjdC5wcm9qZWN0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29kZUJ1aWxkIHByb2plY3QgbmFtZSdcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHaXRIdWJDb25uZWN0aW9uSW5mbycsIHtcbiAgICAgIHZhbHVlOiBnaXRodWJDb25uZWN0aW9uQXJuIHx8ICdObyBHaXRIdWIgY29ubmVjdGlvbiBwcm92aWRlZCAtIHVzaW5nIEdpdEh1YiBPQXV0aCcsXG4gICAgICBkZXNjcmlwdGlvbjogJ0dpdEh1YiBjb25uZWN0aW9uIHN0YXR1cydcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQaXBlbGluZUFydGlmYWN0c0J1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogcGlwZWxpbmVBcnRpZmFjdHNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgYnVja2V0IG5hbWUgZm9yIHBpcGVsaW5lIGFydGlmYWN0cydcbiAgICB9KTtcbiAgfVxufVxuIl19