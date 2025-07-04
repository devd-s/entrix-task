"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("aws-cdk-lib");
const assertions_1 = require("aws-cdk-lib/assertions");
const EnergyAuction = require("../lib/energy-auction-stack");
test('Stack creates required resources', () => {
    const app = new cdk.App();
    const stack = new EnergyAuction.EnergyAuctionStack(app, 'MyTestStack', {
        environment: 'test'
    });
    const template = assertions_1.Template.fromStack(stack);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5lcmd5LWF1Y3Rpb24tc3RhY2sudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVuZXJneS1hdWN0aW9uLXN0YWNrLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxtQ0FBbUM7QUFDbkMsdURBQWtEO0FBQ2xELDZEQUE2RDtBQUU3RCxJQUFJLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO0lBQzVDLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQzFCLE1BQU0sS0FBSyxHQUFHLElBQUksYUFBYSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxhQUFhLEVBQUU7UUFDckUsV0FBVyxFQUFFLE1BQU07S0FDcEIsQ0FBQyxDQUFDO0lBRUgsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7SUFFM0MsMEJBQTBCO0lBQzFCLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtRQUNoRCxVQUFVLEVBQUU7WUFDVixVQUFVLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7U0FDckU7S0FDRixDQUFDLENBQUM7SUFFSCwrQkFBK0I7SUFDL0IsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHNCQUFzQixFQUFFO1FBQ3JELFNBQVMsRUFBRSxhQUFhO1FBQ3hCLHVCQUF1QixFQUFFO1lBQ3ZCLGFBQWEsRUFBRSxLQUFLO1lBQ3BCLE9BQU8sRUFBRSxJQUFJO1NBQ2Q7S0FDRixDQUFDLENBQUM7SUFFSCx3QkFBd0I7SUFDeEIsUUFBUSxDQUFDLGVBQWUsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUVyRCxtQkFBbUI7SUFDbkIsUUFBUSxDQUFDLHFCQUFxQixDQUFDLDBCQUEwQixFQUFFO1FBQ3pELElBQUksRUFBRSx5QkFBeUI7S0FDaEMsQ0FBQyxDQUFDO0lBRUgsc0JBQXNCO0lBQ3RCLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxrQ0FBa0MsRUFBRTtRQUNqRSxnQkFBZ0IsRUFBRSxvQkFBb0I7S0FDdkMsQ0FBQyxDQUFDO0lBRUgsaUJBQWlCO0lBQ2pCLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtRQUNoRCxTQUFTLEVBQUUsMEJBQTBCO0tBQ3RDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFRlbXBsYXRlIH0gZnJvbSAnYXdzLWNkay1saWIvYXNzZXJ0aW9ucyc7XG5pbXBvcnQgKiBhcyBFbmVyZ3lBdWN0aW9uIGZyb20gJy4uL2xpYi9lbmVyZ3ktYXVjdGlvbi1zdGFjayc7XG5cbnRlc3QoJ1N0YWNrIGNyZWF0ZXMgcmVxdWlyZWQgcmVzb3VyY2VzJywgKCkgPT4ge1xuICBjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICBjb25zdCBzdGFjayA9IG5ldyBFbmVyZ3lBdWN0aW9uLkVuZXJneUF1Y3Rpb25TdGFjayhhcHAsICdNeVRlc3RTdGFjaycsIHtcbiAgICBlbnZpcm9ubWVudDogJ3Rlc3QnXG4gIH0pO1xuXG4gIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcblxuICAvLyBUZXN0IFMzIGJ1Y2tldCBjcmVhdGlvblxuICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcbiAgICBCdWNrZXROYW1lOiB7XG4gICAgICAnRm46OkpvaW4nOiBbJycsIFsnb3JkZXItcmVzdWx0cy10ZXN0LScsIHsgUmVmOiAnQVdTOjpBY2NvdW50SWQnIH1dXVxuICAgIH1cbiAgfSk7XG5cbiAgLy8gVGVzdCBEeW5hbW9EQiB0YWJsZSBjcmVhdGlvblxuICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgIFRhYmxlTmFtZTogJ29yZGVycy10ZXN0JyxcbiAgICBUaW1lVG9MaXZlU3BlY2lmaWNhdGlvbjoge1xuICAgICAgQXR0cmlidXRlTmFtZTogJ3R0bCcsXG4gICAgICBFbmFibGVkOiB0cnVlXG4gICAgfVxuICB9KTtcblxuICAvLyBUZXN0IExhbWJkYSBmdW5jdGlvbnNcbiAgdGVtcGxhdGUucmVzb3VyY2VDb3VudElzKCdBV1M6OkxhbWJkYTo6RnVuY3Rpb24nLCAzKTtcblxuICAvLyBUZXN0IEFQSSBHYXRld2F5XG4gIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpBcGlHYXRld2F5OjpSZXN0QXBpJywge1xuICAgIE5hbWU6ICdlbmVyZ3ktYXVjdGlvbi1hcGktdGVzdCdcbiAgfSk7XG5cbiAgLy8gVGVzdCBTdGVwIEZ1bmN0aW9uc1xuICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6U3RlcEZ1bmN0aW9uczo6U3RhdGVNYWNoaW5lJywge1xuICAgIFN0YXRlTWFjaGluZU5hbWU6ICdkYXRhLXBpcGVsaW5lLXRlc3QnXG4gIH0pO1xuXG4gIC8vIFRlc3QgU05TIFRvcGljXG4gIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTTlM6OlRvcGljJywge1xuICAgIFRvcGljTmFtZTogJ2Vycm9yLW5vdGlmaWNhdGlvbnMtdGVzdCdcbiAgfSk7XG59KTsiXX0=