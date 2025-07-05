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
      .when(
        stepfunctions.Condition.numberGreaterThan('$.attempt', 5),
        new stepfunctions.Fail(this, 'MaxRetriesExceeded', {
          error: 'LambdaAMaxRetries',
          cause: 'Lambda A failed to return true results after 5 attempts'
        })
      );

    // Choice state to check results
    const checkResults = new stepfunctions.Choice(this, 'CheckResults')
      .when(
        stepfunctions.Condition.booleanEquals('$.results', false),
        incrementAttempt.next(maxRetryCheck.otherwise(lambdaATask))
      );

    // Map state to process each order
    const processOrdersMap = new stepfunctions.Map(this, 'ProcessOrders', {
      itemsPath: '$.orders',
      maxConcurrency: 10
    });

    // Data transformation for Lambda B compatibility
    const transformForLambdaB = new stepfunctions.Pass(this, 'TransformForLambdaB', {
      parameters: {
        "status.$": "$.order", // Map 'order' field to 'status' field for Lambda B
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

    processOrdersMap.iterator(transformForLambdaB.next(lambdaBWithErrorHandling));

    // Success state
    const successState = new stepfunctions.Succeed(this, 'ProcessingComplete');

    // Define the state machine
    const definition = initializeAttempt
      .next(lambdaATask
        .next(checkResults
          .otherwise(processOrdersMap
            .next(successState)
          )
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
              trigger: codepipelineActions.GitHubTrigger.POLL  // Use polling instead of webhooks
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
