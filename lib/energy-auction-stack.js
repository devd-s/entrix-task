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
        const { environment } = props;
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
            pipelineName: `entrix-energy-auction-pipeline-${environment}`,
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
    }
}
exports.EntrixEnergyAuctionStack = EntrixEnergyAuctionStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5lcmd5LWF1Y3Rpb24tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbmVyZ3ktYXVjdGlvbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMsaURBQWlEO0FBQ2pELHlEQUF5RDtBQUN6RCxxREFBcUQ7QUFDckQseUNBQXlDO0FBQ3pDLDJDQUEyQztBQUMzQywrREFBK0Q7QUFDL0QsZ0VBQWdFO0FBQ2hFLGlEQUFpRDtBQUNqRCwwREFBMEQ7QUFDMUQsMkNBQTJDO0FBQzNDLDZEQUE2RDtBQUM3RCw0RUFBNEU7QUFDNUUsdURBQXVEO0FBRXZELHNFQUFzRTtBQVl0RSxNQUFhLHdCQUF5QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3JELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0M7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUU5QixrREFBa0Q7UUFDbEQsaURBQWlEO1FBQ2pELDJFQUEyRTtRQUMzRSwyRUFBMkU7UUFFM0UsOEJBQThCO1FBQzlCLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUNuRSxVQUFVLEVBQUUsd0JBQXdCLFdBQVcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRTtZQUN2RSxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsU0FBUyxFQUFFLElBQUk7WUFDZixVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7U0FDM0MsQ0FBQyxDQUFDO1FBRUgsNkNBQTZDO1FBQzdDLE1BQU0sV0FBVyxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsYUFB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O29CQUNsQixPQUFPLEVBQUU7d0JBQ1AsSUFBSSxtQkFBbUIsQ0FBQyxlQUFlLENBQUM7NEJBQ3RDLFVBQVUsRUFBRSxXQUFXOzRCQUN2QixPQUFPLEVBQUUsWUFBWTs0QkFDckIsS0FBSyxFQUFFLFlBQVk7NEJBQ25CLE9BQU8sRUFBRSxDQUFDLFdBQVcsQ0FBQzt5QkFDdkIsQ0FBQztxQkFDSDtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsVUFBVTtRQUNWLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JDLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRztZQUNkLFdBQVcsRUFBRSwwQkFBMEI7U0FDeEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRCxLQUFLLEVBQUUsa0JBQWtCLENBQUMsVUFBVTtZQUNwQyxXQUFXLEVBQUUsa0NBQWtDO1NBQ2hELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDekMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxTQUFTO1lBQzVCLFdBQVcsRUFBRSxnQ0FBZ0M7U0FDOUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUN6QyxLQUFLLEVBQUUsWUFBWSxDQUFDLGVBQWU7WUFDbkMsV0FBVyxFQUFFLGtDQUFrQztTQUNoRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE1YkQsNERBNGJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBzdGVwZnVuY3Rpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zdGVwZnVuY3Rpb25zJztcbmltcG9ydCAqIGFzIHNmblRhc2tzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zdGVwZnVuY3Rpb25zLXRhc2tzJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGNvZGVwaXBlbGluZSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZXBpcGVsaW5lJztcbmltcG9ydCAqIGFzIGNvZGVwaXBlbGluZUFjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVwaXBlbGluZS1hY3Rpb25zJztcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWJ1aWxkJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBzbnNTdWJzY3JpcHRpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMtc3Vic2NyaXB0aW9ucyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGludGVyZmFjZSBFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgXG4gIC8vIE9QVElPTkFMIFBST1BTIEZPUiBNVUxUSVBMRSBFTlZJUk9OTUVOVFMgKENPTU1FTlRFRClcbiAgLy8gVW5jb21tZW50IHRvIGVuYWJsZSBlbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWd1cmF0aW9uc1xuICAvLyBzY2hlZHVsZUR1cmF0aW9uPzogbnVtYmVyOyAgLy8gUGlwZWxpbmUgc2NoZWR1bGUgaW4gaG91cnNcbiAgLy8gcmV0ZW50aW9uRGF5cz86IG51bWJlcjsgICAgIC8vIExvZyByZXRlbnRpb24gZGF5c1xufVxuXG5leHBvcnQgY2xhc3MgRW50cml4RW5lcmd5QXVjdGlvblN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVudHJpeEVuZXJneUF1Y3Rpb25TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGVudmlyb25tZW50IH0gPSBwcm9wcztcbiAgICBcbiAgICAvLyBFTlZJUk9OTUVOVC1TUEVDSUZJQyBDT05GSUdVUkFUSU9OUyAoQ09NTUVOVEVEKVxuICAgIC8vIFVuY29tbWVudCB0byB1c2UgZW52aXJvbm1lbnQtc3BlY2lmaWMgc2V0dGluZ3NcbiAgICAvLyBjb25zdCBzY2hlZHVsZUR1cmF0aW9uID0gcHJvcHMuc2NoZWR1bGVEdXJhdGlvbiA/PyAxOyAgLy8gRGVmYXVsdCAxIGhvdXJcbiAgICAvLyBjb25zdCByZXRlbnRpb25EYXlzID0gcHJvcHMucmV0ZW50aW9uRGF5cyA/PyA3OyAgICAgICAgLy8gRGVmYXVsdCA3IGRheXNcblxuICAgIC8vIFMzIEJ1Y2tldCBmb3Igb3JkZXIgcmVzdWx0c1xuICAgIGNvbnN0IG9yZGVyUmVzdWx0c0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ09yZGVyUmVzdWx0c0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBlbnRyaXgtb3JkZXItcmVzdWx0cy0ke2Vudmlyb25tZW50fS0ke2Nkay5Bd3MuQUNDT1VOVF9JRH1gLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VEXG4gICAgfSk7XG5cbiAgICAvLyBEeW5hbW9EQiB0YWJsZSBmb3Igb3JkZXJzIHdpdGggMjQtaG91ciBUVExcbiAgICBjb25zdCBvcmRlcnNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnT3JkZXJzVGFibGUnLCB7XG4gICAgICB0YWJsZU5hbWU6IGBlbnRyaXgtb3JkZXJzLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAncmVjb3JkX2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiAndHRsJyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1lcbiAgICB9KTtcblxuICAgIC8vIFNOUyBUb3BpYyBmb3IgZXJyb3Igbm90aWZpY2F0aW9uc1xuICAgIGNvbnN0IGVycm9yTm90aWZpY2F0aW9uVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdFcnJvck5vdGlmaWNhdGlvblRvcGljJywge1xuICAgICAgdG9waWNOYW1lOiBgZXJyb3Itbm90aWZpY2F0aW9ucy0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkaXNwbGF5TmFtZTogJ0Vycm9yIE5vdGlmaWNhdGlvbnMgZm9yIEVuZXJneSBBdWN0aW9uIElzc3VlcydcbiAgICB9KTtcblxuICAgIC8vIFdlJ2xsIGhhbmRsZSBEeW5hbW9EQiBkZWNpbWFsIGNvbnZlcnNpb24gdmlhIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIC8vIFRoZSBMYW1iZGEgY29kZSBjYW4gY2hlY2sgZm9yIERZTkFNT0RCX0ZMT0FUX1NFUklBTElaRVIgZW52IHZhclxuXG4gICAgLy8gTGFtYmRhIEZ1bmN0aW9uc1xuICAgIFxuICAgIC8vIFBPU1QgTGFtYmRhIGZvciBBUElcbiAgICBjb25zdCBwb3N0TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRW50cml4UG9zdExhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnYXBwLmxhbWJkYV9oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnc3JjL3Bvc3RfbGFtYmRhJyksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBUQUJMRV9OQU1FOiBvcmRlcnNUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIERZTkFNT0RCX0ZMT0FUX1NFUklBTElaRVI6ICd1c2VfZGVjaW1hbCcgLy8gQ29uZmlndXJlIGZsb2F0IGhhbmRsaW5nIHZpYSBlbnYgdmFyXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgQSAtIFJlc3VsdHMgZ2VuZXJhdG9yXG4gICAgY29uc3QgbGFtYmRhQSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0xhbWJkYUEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxuICAgICAgaGFuZGxlcjogJ2FwcC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ3NyYy9sYW1iZGFfYScpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgQiAtIE9yZGVyIHByb2Nlc3NvclxuICAgIGNvbnN0IGxhbWJkYUIgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdMYW1iZGFCJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOSxcbiAgICAgIGhhbmRsZXI6ICdhcHAubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdzcmMvbGFtYmRhX2InLCB7XG4gICAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgICAgaW1hZ2U6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzkuYnVuZGxpbmdJbWFnZSxcbiAgICAgICAgICBjb21tYW5kOiBbXG4gICAgICAgICAgICAnYmFzaCcsICctYycsXG4gICAgICAgICAgICAncGlwIGluc3RhbGwgLXIgcmVxdWlyZW1lbnRzLnR4dCAtdCAvYXNzZXQtb3V0cHV0ICYmIGNwIC1hdSAuIC9hc3NldC1vdXRwdXQnXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTE9HX0JVQ0tFVDogb3JkZXJSZXN1bHRzQnVja2V0LmJ1Y2tldE5hbWVcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMClcbiAgICB9KTtcblxuICAgIC8vIFNsYWNrIE5vdGlmaWNhdGlvbiBMYW1iZGEgKHN1YnNjcmliZXMgdG8gU05TIGZvciBlcnJvciBhbGVydHMpXG4gICAgY29uc3Qgc2xhY2tOb3RpZmljYXRpb25MYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTbGFja05vdGlmaWNhdGlvbkxhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5pbXBvcnQganNvblxuaW1wb3J0IHVybGxpYjNcbmltcG9ydCBvc1xuXG5kZWYgbGFtYmRhX2hhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIFwiXCJcIlxuICAgIFByb2Nlc3MgU05TIG5vdGlmaWNhdGlvbiBhbmQgc2VuZCBmb3JtYXR0ZWQgbWVzc2FnZSB0byBTbGFja1xuICAgIFwiXCJcIlxuICAgICMgUGFyc2UgU05TIG1lc3NhZ2VcbiAgICBzbnNfbWVzc2FnZSA9IGpzb24ubG9hZHMoZXZlbnRbJ1JlY29yZHMnXVswXVsnU25zJ11bJ01lc3NhZ2UnXSlcbiAgICBcbiAgICAjIEdldCBTbGFjayB3ZWJob29rIFVSTCBmcm9tIGVudmlyb25tZW50ICh3b3VsZCBiZSBzZXQgaW4gcmVhbCBkZXBsb3ltZW50KVxuICAgIHNsYWNrX3dlYmhvb2tfdXJsID0gb3MuZW52aXJvbi5nZXQoJ1NMQUNLX1dFQkhPT0tfVVJMJywgJ2h0dHBzOi8vaG9va3Muc2xhY2suY29tL3NlcnZpY2VzL1lPVVIvU0xBQ0svV0VCSE9PSycpXG4gICAgXG4gICAgIyBGb3JtYXQgU2xhY2sgbWVzc2FnZVxuICAgIHNsYWNrX3BheWxvYWQgPSB7XG4gICAgICAgIFwidGV4dFwiOiBmXCLwn5qoICp7c25zX21lc3NhZ2UuZ2V0KCdhbGVydCcsICdFcnJvciBBbGVydCcpfSpcIixcbiAgICAgICAgXCJibG9ja3NcIjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImhlYWRlclwiLFxuICAgICAgICAgICAgICAgIFwidGV4dFwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInBsYWluX3RleHRcIixcbiAgICAgICAgICAgICAgICAgICAgXCJ0ZXh0XCI6IGZcIvCfmqgge3Nuc19tZXNzYWdlLmdldCgnc2VydmljZScsICdTZXJ2aWNlJyl9IEFsZXJ0XCJcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInNlY3Rpb25cIixcbiAgICAgICAgICAgICAgICBcImZpZWxkc1wiOiBbXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcIm1ya2R3blwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0ZXh0XCI6IGZcIipFbnZpcm9ubWVudDoqXFxcXG57c25zX21lc3NhZ2UuZ2V0KCdlbnZpcm9ubWVudCcsICd1bmtub3duJyl9XCJcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwibXJrZHduXCIsIFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0ZXh0XCI6IGZcIipFcnJvcjoqXFxcXG57c25zX21lc3NhZ2UuZ2V0KCdlcnJvcicsICdVbmtub3duIGVycm9yJyl9XCJcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwibXJrZHduXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcInRleHRcIjogZlwiKkV4ZWN1dGlvbjoqXFxcXG57c25zX21lc3NhZ2UuZ2V0KCdleGVjdXRpb25OYW1lJywgJ04vQScpfVwiXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcIm1ya2R3blwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0ZXh0XCI6IGZcIipUaW1lc3RhbXA6KlxcXFxue3Nuc19tZXNzYWdlLmdldCgndGltZXN0YW1wJywgJ04vQScpfVwiXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInNlY3Rpb25cIixcbiAgICAgICAgICAgICAgICBcInRleHRcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJtcmtkd25cIixcbiAgICAgICAgICAgICAgICAgICAgXCJ0ZXh0XCI6IGZcIipFcnJvciBEZXRhaWxzOipcXFxcblxcYFxcYFxcYHtzbnNfbWVzc2FnZS5nZXQoJ2Vycm9yRGV0YWlscycsICdObyBkZXRhaWxzIGF2YWlsYWJsZScpfVxcYFxcYFxcYFwiXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJjb250ZXh0XCIsXG4gICAgICAgICAgICAgICAgXCJlbGVtZW50c1wiOiBbXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcIm1ya2R3blwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0ZXh0XCI6IGZcIlJlZ2lvbjoge3Nuc19tZXNzYWdlLmdldCgncmVnaW9uJywgJ04vQScpfSB8IFN0YXRlIE1hY2hpbmU6IHtzbnNfbWVzc2FnZS5nZXQoJ3N0YXRlTWFjaGluZUFybicsICdOL0EnKX1cIlxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfVxuICAgIFxuICAgICMgU2VuZCB0byBTbGFjayAoaW4gcHJvZHVjdGlvbiwgeW91J2QgdXNlIHRoZSBhY3R1YWwgd2ViaG9vaylcbiAgICBodHRwID0gdXJsbGliMy5Qb29sTWFuYWdlcigpXG4gICAgXG4gICAgdHJ5OlxuICAgICAgICByZXNwb25zZSA9IGh0dHAucmVxdWVzdChcbiAgICAgICAgICAgICdQT1NUJyxcbiAgICAgICAgICAgIHNsYWNrX3dlYmhvb2tfdXJsLFxuICAgICAgICAgICAgYm9keT1qc29uLmR1bXBzKHNsYWNrX3BheWxvYWQpLFxuICAgICAgICAgICAgaGVhZGVycz17J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ31cbiAgICAgICAgKVxuICAgICAgICBcbiAgICAgICAgcHJpbnQoZlwiU2xhY2sgbm90aWZpY2F0aW9uIHNlbnQgc3VjY2Vzc2Z1bGx5LiBTdGF0dXM6IHtyZXNwb25zZS5zdGF0dXN9XCIpXG4gICAgICAgIHByaW50KGZcIlBheWxvYWQ6IHtqc29uLmR1bXBzKHNsYWNrX3BheWxvYWQsIGluZGVudD0yKX1cIilcbiAgICAgICAgXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDIwMCxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7XG4gICAgICAgICAgICAgICAgJ21lc3NhZ2UnOiAnTm90aWZpY2F0aW9uIHNlbnQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICAgICAgICAnc2xhY2tfcmVzcG9uc2Vfc3RhdHVzJzogcmVzcG9uc2Uuc3RhdHVzXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIFxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZTpcbiAgICAgICAgcHJpbnQoZlwiRmFpbGVkIHRvIHNlbmQgU2xhY2sgbm90aWZpY2F0aW9uOiB7c3RyKGUpfVwiKVxuICAgICAgICBwcmludChmXCJXb3VsZCBoYXZlIHNlbnQ6IHtqc29uLmR1bXBzKHNsYWNrX3BheWxvYWQsIGluZGVudD0yKX1cIilcbiAgICAgICAgXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDUwMCxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7XG4gICAgICAgICAgICAgICAgJ2Vycm9yJzogJ0ZhaWxlZCB0byBzZW5kIG5vdGlmaWNhdGlvbicsXG4gICAgICAgICAgICAgICAgJ2RldGFpbHMnOiBzdHIoZSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIGApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgJ1NMQUNLX1dFQkhPT0tfVVJMJzogJ2h0dHBzOi8vaG9va3Muc2xhY2suY29tL3NlcnZpY2VzL1lPVVIvU0xBQ0svV0VCSE9PSycgLy8gUmVwbGFjZSB3aXRoIGFjdHVhbCB3ZWJob29rXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgZGVzY3JpcHRpb246ICdTZW5kcyBmb3JtYXR0ZWQgZXJyb3Igbm90aWZpY2F0aW9ucyB0byBTbGFjayBjaGFubmVsJ1xuICAgIH0pO1xuXG4gICAgLy8gU3Vic2NyaWJlIFNsYWNrIExhbWJkYSB0byBTTlMgdG9waWNcbiAgICBlcnJvck5vdGlmaWNhdGlvblRvcGljLmFkZFN1YnNjcmlwdGlvbihcbiAgICAgIG5ldyBzbnNTdWJzY3JpcHRpb25zLkxhbWJkYVN1YnNjcmlwdGlvbihzbGFja05vdGlmaWNhdGlvbkxhbWJkYSlcbiAgICApO1xuXG4gICAgLy8gQWRkIGVtYWlsIHN1YnNjcmlwdGlvbiBmb3IgY3JpdGljYWwgYWxlcnRzIChyZXBsYWNlIHdpdGggYWN0dWFsIGVtYWlsKVxuICAgIGVycm9yTm90aWZpY2F0aW9uVG9waWMuYWRkU3Vic2NyaXB0aW9uKFxuICAgICAgbmV3IHNuc1N1YnNjcmlwdGlvbnMuRW1haWxTdWJzY3JpcHRpb24oJ2Rldm9wcy10ZWFtQGNvbXBhbnkuY29tJylcbiAgICApO1xuXG4gICAgLy8gT3B0aW9uYWw6IEFkZCBTTVMgc3Vic2NyaXB0aW9uIGZvciB1cmdlbnQgYWxlcnRzXG4gICAgLy8gZXJyb3JOb3RpZmljYXRpb25Ub3BpYy5hZGRTdWJzY3JpcHRpb24oXG4gICAgLy8gICBuZXcgc25zU3Vic2NyaXB0aW9ucy5TbXNTdWJzY3JpcHRpb24oJysxMjM0NTY3ODkwJylcbiAgICAvLyApO1xuXG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9uc1xuICAgIG9yZGVyc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShwb3N0TGFtYmRhKTtcbiAgICBvcmRlclJlc3VsdHNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUobGFtYmRhQik7XG5cbiAgICAvLyBBUEkgR2F0ZXdheVxuICAgIGNvbnN0IGFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ0VuZXJneUF1Y3Rpb25BcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogYGVudHJpeC1lbmVyZ3ktYXVjdGlvbi1hcGktJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgZm9yIGVuZXJneSBhdWN0aW9uIG9yZGVycycsXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogZW52aXJvbm1lbnRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IG9yZGVyc1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ29yZGVycycpO1xuICAgIG9yZGVyc1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBvc3RMYW1iZGEpKTtcblxuICAgIC8vIFN0ZXAgRnVuY3Rpb25zIFN0YXRlIE1hY2hpbmUgZm9yIGRhdGEgcGlwZWxpbmVcbiAgICBcbiAgICAvLyBMYW1iZGEgQSB0YXNrIHdpdGggcmV0cnkgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGxhbWJkYUFUYXNrID0gbmV3IHNmblRhc2tzLkxhbWJkYUludm9rZSh0aGlzLCAnSW52b2tlTGFtYmRhQScsIHtcbiAgICAgIGxhbWJkYUZ1bmN0aW9uOiBsYW1iZGFBLFxuICAgICAgb3V0cHV0UGF0aDogJyQuUGF5bG9hZCcsXG4gICAgICByZXRyeU9uU2VydmljZUV4Y2VwdGlvbnM6IHRydWUsXG4gICAgICBwYXlsb2FkOiBzdGVwZnVuY3Rpb25zLlRhc2tJbnB1dC5mcm9tT2JqZWN0KHtcbiAgICAgICAgXCJhdHRlbXB0LiRcIjogXCIkLmF0dGVtcHRcIixcbiAgICAgICAgXCJpbnB1dC4kXCI6IFwiJFwiXG4gICAgICB9KVxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGF0dGVtcHQgY291bnRlciBpbml0aWFsaXphdGlvblxuICAgIGNvbnN0IGluaXRpYWxpemVBdHRlbXB0ID0gbmV3IHN0ZXBmdW5jdGlvbnMuUGFzcyh0aGlzLCAnSW5pdGlhbGl6ZUF0dGVtcHQnLCB7XG4gICAgICByZXN1bHQ6IHN0ZXBmdW5jdGlvbnMuUmVzdWx0LmZyb21PYmplY3QoeyBhdHRlbXB0OiAxIH0pLFxuICAgICAgcmVzdWx0UGF0aDogJyQuYXR0ZW1wdCdcbiAgICB9KTtcblxuICAgIC8vIEluY3JlbWVudCBhdHRlbXB0IGNvdW50ZXJcbiAgICBjb25zdCBpbmNyZW1lbnRBdHRlbXB0ID0gbmV3IHN0ZXBmdW5jdGlvbnMuUGFzcyh0aGlzLCAnSW5jcmVtZW50QXR0ZW1wdCcsIHtcbiAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgXCJhdHRlbXB0LiRcIjogXCJTdGF0ZXMuTWF0aEFkZCgkLmF0dGVtcHQsIDEpXCIsXG4gICAgICAgIFwiaW5wdXQuJFwiOiBcIiRcIlxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQ2hlY2sgbWF4IHJldHJpZXNcbiAgICBjb25zdCBtYXhSZXRyeUNoZWNrID0gbmV3IHN0ZXBmdW5jdGlvbnMuQ2hvaWNlKHRoaXMsICdDaGVja01heFJldHJpZXMnKVxuICAgICAgLndoZW4oXG4gICAgICAgIHN0ZXBmdW5jdGlvbnMuQ29uZGl0aW9uLm51bWJlckdyZWF0ZXJUaGFuKCckLmF0dGVtcHQnLCA1KSxcbiAgICAgICAgbmV3IHN0ZXBmdW5jdGlvbnMuRmFpbCh0aGlzLCAnTWF4UmV0cmllc0V4Y2VlZGVkJywge1xuICAgICAgICAgIGVycm9yOiAnTGFtYmRhQU1heFJldHJpZXMnLFxuICAgICAgICAgIGNhdXNlOiAnTGFtYmRhIEEgZmFpbGVkIHRvIHJldHVybiB0cnVlIHJlc3VsdHMgYWZ0ZXIgNSBhdHRlbXB0cydcbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICAvLyBDaG9pY2Ugc3RhdGUgdG8gY2hlY2sgcmVzdWx0c1xuICAgIGNvbnN0IGNoZWNrUmVzdWx0cyA9IG5ldyBzdGVwZnVuY3Rpb25zLkNob2ljZSh0aGlzLCAnQ2hlY2tSZXN1bHRzJylcbiAgICAgIC53aGVuKFxuICAgICAgICBzdGVwZnVuY3Rpb25zLkNvbmRpdGlvbi5ib29sZWFuRXF1YWxzKCckLnJlc3VsdHMnLCBmYWxzZSksXG4gICAgICAgIGluY3JlbWVudEF0dGVtcHQubmV4dChtYXhSZXRyeUNoZWNrLm90aGVyd2lzZShsYW1iZGFBVGFzaykpXG4gICAgICApO1xuXG4gICAgLy8gTWFwIHN0YXRlIHRvIHByb2Nlc3MgZWFjaCBvcmRlclxuICAgIGNvbnN0IHByb2Nlc3NPcmRlcnNNYXAgPSBuZXcgc3RlcGZ1bmN0aW9ucy5NYXAodGhpcywgJ1Byb2Nlc3NPcmRlcnMnLCB7XG4gICAgICBpdGVtc1BhdGg6ICckLm9yZGVycycsXG4gICAgICBtYXhDb25jdXJyZW5jeTogMTBcbiAgICB9KTtcblxuICAgIC8vIERhdGEgdHJhbnNmb3JtYXRpb24gZm9yIExhbWJkYSBCIGNvbXBhdGliaWxpdHlcbiAgICBjb25zdCB0cmFuc2Zvcm1Gb3JMYW1iZGFCID0gbmV3IHN0ZXBmdW5jdGlvbnMuUGFzcyh0aGlzLCAnVHJhbnNmb3JtRm9yTGFtYmRhQicsIHtcbiAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgXCJzdGF0dXMuJFwiOiBcIiQub3JkZXJcIiwgLy8gTWFwICdvcmRlcicgZmllbGQgdG8gJ3N0YXR1cycgZmllbGQgZm9yIExhbWJkYSBCXG4gICAgICAgIFwiaWQuJFwiOiBcIiQuaWRcIixcbiAgICAgICAgXCJ0aW1lc3RhbXAuJFwiOiBcIiQudGltZXN0YW1wXCIsXG4gICAgICAgIFwiZGF0YS4kXCI6IFwiJFwiIC8vIFBhc3MgdGhyb3VnaCBhbGwgb3JpZ2luYWwgZGF0YVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIEIgdGFzayB3aXRoIGVycm9yIGhhbmRsaW5nXG4gICAgY29uc3QgbGFtYmRhQlRhc2sgPSBuZXcgc2ZuVGFza3MuTGFtYmRhSW52b2tlKHRoaXMsICdJbnZva2VMYW1iZGFCJywge1xuICAgICAgbGFtYmRhRnVuY3Rpb246IGxhbWJkYUIsXG4gICAgICBpbnB1dFBhdGg6ICckJyxcbiAgICAgIHJlc3VsdFBhdGg6ICckLnJlc3VsdCdcbiAgICB9KTtcblxuICAgIC8vIEVuaGFuY2VkIFNOUyBub3RpZmljYXRpb24gb24gZXJyb3Igd2l0aCBkZXRhaWxlZCBjb250ZXh0XG4gICAgY29uc3Qgc2VuZEVycm9yTm90aWZpY2F0aW9uID0gbmV3IHNmblRhc2tzLlNuc1B1Ymxpc2godGhpcywgJ1NlbmRFcnJvck5vdGlmaWNhdGlvbicsIHtcbiAgICAgIHRvcGljOiBlcnJvck5vdGlmaWNhdGlvblRvcGljLFxuICAgICAgc3ViamVjdDogJ/CfmqggTGFtYmRhIEIgUHJvY2Vzc2luZyBFcnJvcicsXG4gICAgICBtZXNzYWdlOiBzdGVwZnVuY3Rpb25zLlRhc2tJbnB1dC5mcm9tT2JqZWN0KHtcbiAgICAgICAgYWxlcnQ6ICfwn5qoIExhbWJkYSBCIEVycm9yJyxcbiAgICAgICAgZW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICAgICAgICBzZXJ2aWNlOiAnRW5lcmd5IEF1Y3Rpb24gUHJvY2Vzc2luZycsXG4gICAgICAgIGVycm9yOiAnTGFtYmRhIEIgZmFpbGVkIHRvIHByb2Nlc3Mgb3JkZXInLFxuICAgICAgICBlcnJvckRldGFpbHM6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQuZXJyb3IuRXJyb3InKSxcbiAgICAgICAgZmFpbGVkT3JkZXI6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGgub2JqZWN0QXQoJyQuZGF0YScpLFxuICAgICAgICBleGVjdXRpb25OYW1lOiBzdGVwZnVuY3Rpb25zLkpzb25QYXRoLnN0cmluZ0F0KCckJC5FeGVjdXRpb24uTmFtZScpLFxuICAgICAgICB0aW1lc3RhbXA6IHN0ZXBmdW5jdGlvbnMuSnNvblBhdGguc3RyaW5nQXQoJyQkLlN0YXRlLkVudGVyZWRUaW1lJyksXG4gICAgICAgIHN0YXRlTWFjaGluZUFybjogc3RlcGZ1bmN0aW9ucy5Kc29uUGF0aC5zdHJpbmdBdCgnJCQuU3RhdGVNYWNoaW5lLk5hbWUnKSxcbiAgICAgICAgcmVnaW9uOiAnZXUtd2VzdC0xJ1xuICAgICAgfSlcbiAgICB9KTtcblxuICAgIC8vIENhdGNoIGJsb2NrIGZvciBMYW1iZGEgQiBlcnJvcnNcbiAgICBjb25zdCBsYW1iZGFCV2l0aEVycm9ySGFuZGxpbmcgPSBsYW1iZGFCVGFzay5hZGRDYXRjaChzZW5kRXJyb3JOb3RpZmljYXRpb24sIHtcbiAgICAgIGVycm9yczogWydTdGF0ZXMuVGFza0ZhaWxlZCddLFxuICAgICAgcmVzdWx0UGF0aDogJyQuZXJyb3InXG4gICAgfSk7XG5cbiAgICBwcm9jZXNzT3JkZXJzTWFwLml0ZXJhdG9yKHRyYW5zZm9ybUZvckxhbWJkYUIubmV4dChsYW1iZGFCV2l0aEVycm9ySGFuZGxpbmcpKTtcblxuICAgIC8vIFN1Y2Nlc3Mgc3RhdGVcbiAgICBjb25zdCBzdWNjZXNzU3RhdGUgPSBuZXcgc3RlcGZ1bmN0aW9ucy5TdWNjZWVkKHRoaXMsICdQcm9jZXNzaW5nQ29tcGxldGUnKTtcblxuICAgIC8vIERlZmluZSB0aGUgc3RhdGUgbWFjaGluZVxuICAgIGNvbnN0IGRlZmluaXRpb24gPSBpbml0aWFsaXplQXR0ZW1wdFxuICAgICAgLm5leHQobGFtYmRhQVRhc2tcbiAgICAgICAgLm5leHQoY2hlY2tSZXN1bHRzXG4gICAgICAgICAgLm90aGVyd2lzZShwcm9jZXNzT3JkZXJzTWFwXG4gICAgICAgICAgICAubmV4dChzdWNjZXNzU3RhdGUpXG4gICAgICAgICAgKVxuICAgICAgICApXG4gICAgICApO1xuXG4gICAgY29uc3Qgc3RhdGVNYWNoaW5lID0gbmV3IHN0ZXBmdW5jdGlvbnMuU3RhdGVNYWNoaW5lKHRoaXMsICdEYXRhUGlwZWxpbmVTdGF0ZU1hY2hpbmUnLCB7XG4gICAgICBzdGF0ZU1hY2hpbmVOYW1lOiBgZW50cml4LWRhdGEtcGlwZWxpbmUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZGVmaW5pdGlvbjogZGVmaW5pdGlvbixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KVxuICAgIH0pO1xuXG4gICAgLy8gRXZlbnRCcmlkZ2UgcnVsZSB0byB0cmlnZ2VyIHRoZSBzdGF0ZSBtYWNoaW5lIG9uIHNjaGVkdWxlXG4gICAgY29uc3Qgc2NoZWR1bGVSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdEYXRhUGlwZWxpbmVTY2hlZHVsZScsIHtcbiAgICAgIHJ1bGVOYW1lOiBgZGF0YS1waXBlbGluZS1zY2hlZHVsZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoY2RrLkR1cmF0aW9uLmhvdXJzKDEpKSwgLy8gUnVuIGV2ZXJ5IGhvdXJcbiAgICAgIC8vIEVOVklST05NRU5ULVNQRUNJRklDIFNDSEVEVUxFIChDT01NRU5URUQpXG4gICAgICAvLyBVbmNvbW1lbnQgdG8gdXNlIGRpZmZlcmVudCBzY2hlZHVsZXMgcGVyIGVudmlyb25tZW50OlxuICAgICAgLy8gc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5yYXRlKGNkay5EdXJhdGlvbi5ob3VycyhzY2hlZHVsZUR1cmF0aW9uKSksXG4gICAgICB0YXJnZXRzOiBbXG4gICAgICAgIG5ldyB0YXJnZXRzLlNmblN0YXRlTWFjaGluZShzdGF0ZU1hY2hpbmUpXG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBHaXRIdWIgVG9rZW4gU2VjcmV0IGZvciBDb2RlUGlwZWxpbmUgKG1hbmFnZWQgZXh0ZXJuYWxseSBieSBHaXRIdWIgQWN0aW9ucylcblxuICAgIC8vIENvZGVQaXBlbGluZSBmb3IgQ0kvQ0RcbiAgICBjb25zdCBzb3VyY2VPdXRwdXQgPSBuZXcgY29kZXBpcGVsaW5lLkFydGlmYWN0KCk7XG4gICAgY29uc3QgYnVpbGRPdXRwdXQgPSBuZXcgY29kZXBpcGVsaW5lLkFydGlmYWN0KCk7XG5cbiAgICBjb25zdCBidWlsZFByb2plY3QgPSBuZXcgY29kZWJ1aWxkLlBpcGVsaW5lUHJvamVjdCh0aGlzLCAnQnVpbGRQcm9qZWN0Jywge1xuICAgICAgcHJvamVjdE5hbWU6IGBlbmVyZ3ktYXVjdGlvbi1idWlsZC0ke2Vudmlyb25tZW50fWAsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBidWlsZEltYWdlOiBjb2RlYnVpbGQuTGludXhCdWlsZEltYWdlLlNUQU5EQVJEXzVfMCxcbiAgICAgICAgY29tcHV0ZVR5cGU6IGNvZGVidWlsZC5Db21wdXRlVHlwZS5TTUFMTFxuICAgICAgfSxcbiAgICAgIGJ1aWxkU3BlYzogY29kZWJ1aWxkLkJ1aWxkU3BlYy5mcm9tT2JqZWN0KHtcbiAgICAgICAgdmVyc2lvbjogJzAuMicsXG4gICAgICAgIHBoYXNlczoge1xuICAgICAgICAgIGluc3RhbGw6IHtcbiAgICAgICAgICAgICdydW50aW1lLXZlcnNpb25zJzoge1xuICAgICAgICAgICAgICBub2RlanM6ICcxOCdcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAnbnBtIGluc3RhbGwgLWcgYXdzLWNkaycsXG4gICAgICAgICAgICAgICducG0gY2knXG4gICAgICAgICAgICBdXG4gICAgICAgICAgfSxcbiAgICAgICAgICBwcmVfYnVpbGQ6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICducG0gcnVuIHRlc3QnLFxuICAgICAgICAgICAgICAnY2RrIHN5bnRoJ1xuICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgICAgYnVpbGQ6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICdjZGsgZGVwbG95IC0tcmVxdWlyZS1hcHByb3ZhbCBuZXZlcidcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBDb2RlQnVpbGQgcGVybWlzc2lvbnMgdG8gZGVwbG95IENES1xuICAgIGJ1aWxkUHJvamVjdC5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWycqJ10sXG4gICAgICByZXNvdXJjZXM6IFsnKiddXG4gICAgfSkpO1xuXG4gICAgY29uc3QgcGlwZWxpbmUgPSBuZXcgY29kZXBpcGVsaW5lLlBpcGVsaW5lKHRoaXMsICdQaXBlbGluZScsIHtcbiAgICAgIHBpcGVsaW5lTmFtZTogYGVudHJpeC1lbmVyZ3ktYXVjdGlvbi1waXBlbGluZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBzdGFnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHN0YWdlTmFtZTogJ1NvdXJjZScsXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgbmV3IGNvZGVwaXBlbGluZUFjdGlvbnMuR2l0SHViU291cmNlQWN0aW9uKHtcbiAgICAgICAgICAgICAgYWN0aW9uTmFtZTogJ0dpdEh1Yl9Tb3VyY2UnLFxuICAgICAgICAgICAgICBvd25lcjogJ2RldmQnLCBcbiAgICAgICAgICAgICAgcmVwbzogJ2VudHJpeC10YXNrJyxcbiAgICAgICAgICAgICAgb2F1dGhUb2tlbjogY2RrLlNlY3JldFZhbHVlLnNlY3JldHNNYW5hZ2VyKGBlbnRyaXgtZ2l0aHViLXRva2VuLSR7ZW52aXJvbm1lbnR9YCksXG4gICAgICAgICAgICAgIG91dHB1dDogc291cmNlT3V0cHV0LFxuICAgICAgICAgICAgICBicmFuY2g6ICdtYWluJyxcbiAgICAgICAgICAgICAgdHJpZ2dlcjogY29kZXBpcGVsaW5lQWN0aW9ucy5HaXRIdWJUcmlnZ2VyLlBPTEwgIC8vIFVzZSBwb2xsaW5nIGluc3RlYWQgb2Ygd2ViaG9va3NcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnQnVpbGQnLFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgIG5ldyBjb2RlcGlwZWxpbmVBY3Rpb25zLkNvZGVCdWlsZEFjdGlvbih7XG4gICAgICAgICAgICAgIGFjdGlvbk5hbWU6ICdDb2RlQnVpbGQnLFxuICAgICAgICAgICAgICBwcm9qZWN0OiBidWlsZFByb2plY3QsXG4gICAgICAgICAgICAgIGlucHV0OiBzb3VyY2VPdXRwdXQsXG4gICAgICAgICAgICAgIG91dHB1dHM6IFtidWlsZE91dHB1dF1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUVuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IGFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IGVuZHBvaW50IFVSTCdcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdPcmRlclJlc3VsdHNCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IG9yZGVyUmVzdWx0c0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTMyBidWNrZXQgbmFtZSBmb3Igb3JkZXIgcmVzdWx0cydcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdPcmRlcnNUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogb3JkZXJzVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiB0YWJsZSBuYW1lIGZvciBvcmRlcnMnXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU3RhdGVNYWNoaW5lQXJuJywge1xuICAgICAgdmFsdWU6IHN0YXRlTWFjaGluZS5zdGF0ZU1hY2hpbmVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0ZXAgRnVuY3Rpb25zIHN0YXRlIG1hY2hpbmUgQVJOJ1xuICAgIH0pO1xuICB9XG59XG4iXX0=