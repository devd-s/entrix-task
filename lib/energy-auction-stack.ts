import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as sfnTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface EntrixEnergyAuctionStackProps extends cdk.StackProps {
  environment: string;
  
  // OPTIONAL PROPS FOR MULTIPLE ENVIRONMENTS (COMMENTED)
  // Uncomment to enable environment-specific configurations
  // scheduleDuration?: number;  // Pipeline schedule in hours
  // retentionDays?: number;     // Log retention days
}

export class EntrixEnergyAuctionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EntrixEnergyAuctionStackProps) {
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

    // Lambda Functions
    
    // POST Lambda for API
    const postLambda = new lambda.Function(this, 'EntrixPostLambda', {
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
      restApiName: `entrix-energy-auction-api-${environment}`,
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
      .when(
        stepfunctions.Condition.booleanEquals('$.results', false),
        lambdaATask // Retry Lambda A if results are false
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
          .next(successState)
        )
      );

    const stateMachine = new stepfunctions.StateMachine(this, 'DataPipelineStateMachine', {
      stateMachineName: `entrix-data-pipeline-${environment}`,
      definition: definition,
      timeout: cdk.Duration.minutes(15)
    });

    // EventBridge rule to trigger the state machine on schedule
    const scheduleRule = new events.Rule(this, 'DataPipelineSchedule', {
      ruleName: `data-pipeline-schedule-${environment}`,
      schedule: events.Schedule.rate(cdk.Duration.hours(1)), // Run every hour
      // ENVIRONMENT-SPECIFIC SCHEDULE (COMMENTED)
      // Uncomment to use different schedules per environment:
      // schedule: events.Schedule.rate(cdk.Duration.hours(scheduleDuration)),
      targets: [
        new targets.SfnStateMachine(stateMachine)
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