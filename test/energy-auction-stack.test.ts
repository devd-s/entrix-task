import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as EntrixEnergyAuction from '../lib/energy-auction-stack';

test('Stack creates required resources', () => {
  const app = new cdk.App();
  const stack = new EntrixEnergyAuction.EntrixEnergyAuctionStack(app, 'MyTestStack', {
    environment: 'test'
  });

  const template = Template.fromStack(stack);

  // Test S3 bucket creation
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: {
      'Fn::Join': ['', ['order-results-test-', { Ref: 'AWS::AccountId' }]]
    }
  });

  // Test DynamoDB table creation
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TableName: 'orders-test',
    TimeToLiveSpecification: {
      AttributeName: 'ttl',
      Enabled: true
    }
  });

  // Test Lambda functions
  template.resourceCountIs('AWS::Lambda::Function', 3);

  // Test API Gateway
  template.hasResourceProperties('AWS::ApiGateway::RestApi', {
    Name: 'energy-auction-api-test'
  });

  // Test Step Functions
  template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
    StateMachineName: 'data-pipeline-test'
  });

  // Test SNS Topic
  template.hasResourceProperties('AWS::SNS::Topic', {
    TopicName: 'error-notifications-test'
  });
});