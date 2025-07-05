"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("aws-cdk-lib");
const assertions_1 = require("aws-cdk-lib/assertions");
const EntrixEnergyAuction = require("../lib/energy-auction-stack");
test('Stack creates required resources', () => {
    const app = new cdk.App();
    const stack = new EntrixEnergyAuction.EntrixEnergyAuctionStack(app, 'MyTestStack', {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5lcmd5LWF1Y3Rpb24tc3RhY2sudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVuZXJneS1hdWN0aW9uLXN0YWNrLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxtQ0FBbUM7QUFDbkMsdURBQWtEO0FBQ2xELG1FQUFtRTtBQUVuRSxJQUFJLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO0lBQzVDLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQzFCLE1BQU0sS0FBSyxHQUFHLElBQUksbUJBQW1CLENBQUMsd0JBQXdCLENBQUMsR0FBRyxFQUFFLGFBQWEsRUFBRTtRQUNqRixXQUFXLEVBQUUsTUFBTTtLQUNwQixDQUFDLENBQUM7SUFFSCxNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUUzQywwQkFBMEI7SUFDMUIsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO1FBQ2hELFVBQVUsRUFBRTtZQUNWLFVBQVUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLHFCQUFxQixFQUFFLEVBQUUsR0FBRyxFQUFFLGdCQUFnQixFQUFFLENBQUMsQ0FBQztTQUNyRTtLQUNGLENBQUMsQ0FBQztJQUVILCtCQUErQjtJQUMvQixRQUFRLENBQUMscUJBQXFCLENBQUMsc0JBQXNCLEVBQUU7UUFDckQsU0FBUyxFQUFFLGFBQWE7UUFDeEIsdUJBQXVCLEVBQUU7WUFDdkIsYUFBYSxFQUFFLEtBQUs7WUFDcEIsT0FBTyxFQUFFLElBQUk7U0FDZDtLQUNGLENBQUMsQ0FBQztJQUVILHdCQUF3QjtJQUN4QixRQUFRLENBQUMsZUFBZSxDQUFDLHVCQUF1QixFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRXJELG1CQUFtQjtJQUNuQixRQUFRLENBQUMscUJBQXFCLENBQUMsMEJBQTBCLEVBQUU7UUFDekQsSUFBSSxFQUFFLHlCQUF5QjtLQUNoQyxDQUFDLENBQUM7SUFFSCxzQkFBc0I7SUFDdEIsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGtDQUFrQyxFQUFFO1FBQ2pFLGdCQUFnQixFQUFFLG9CQUFvQjtLQUN2QyxDQUFDLENBQUM7SUFFSCxpQkFBaUI7SUFDakIsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO1FBQ2hELFNBQVMsRUFBRSwwQkFBMEI7S0FDdEMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgVGVtcGxhdGUgfSBmcm9tICdhd3MtY2RrLWxpYi9hc3NlcnRpb25zJztcbmltcG9ydCAqIGFzIEVudHJpeEVuZXJneUF1Y3Rpb24gZnJvbSAnLi4vbGliL2VuZXJneS1hdWN0aW9uLXN0YWNrJztcblxudGVzdCgnU3RhY2sgY3JlYXRlcyByZXF1aXJlZCByZXNvdXJjZXMnLCAoKSA9PiB7XG4gIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gIGNvbnN0IHN0YWNrID0gbmV3IEVudHJpeEVuZXJneUF1Y3Rpb24uRW50cml4RW5lcmd5QXVjdGlvblN0YWNrKGFwcCwgJ015VGVzdFN0YWNrJywge1xuICAgIGVudmlyb25tZW50OiAndGVzdCdcbiAgfSk7XG5cbiAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXG4gIC8vIFRlc3QgUzMgYnVja2V0IGNyZWF0aW9uXG4gIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgIEJ1Y2tldE5hbWU6IHtcbiAgICAgICdGbjo6Sm9pbic6IFsnJywgWydvcmRlci1yZXN1bHRzLXRlc3QtJywgeyBSZWY6ICdBV1M6OkFjY291bnRJZCcgfV1dXG4gICAgfVxuICB9KTtcblxuICAvLyBUZXN0IER5bmFtb0RCIHRhYmxlIGNyZWF0aW9uXG4gIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgVGFibGVOYW1lOiAnb3JkZXJzLXRlc3QnLFxuICAgIFRpbWVUb0xpdmVTcGVjaWZpY2F0aW9uOiB7XG4gICAgICBBdHRyaWJ1dGVOYW1lOiAndHRsJyxcbiAgICAgIEVuYWJsZWQ6IHRydWVcbiAgICB9XG4gIH0pO1xuXG4gIC8vIFRlc3QgTGFtYmRhIGZ1bmN0aW9uc1xuICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoJ0FXUzo6TGFtYmRhOjpGdW5jdGlvbicsIDMpO1xuXG4gIC8vIFRlc3QgQVBJIEdhdGV3YXlcbiAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkFwaUdhdGV3YXk6OlJlc3RBcGknLCB7XG4gICAgTmFtZTogJ2VuZXJneS1hdWN0aW9uLWFwaS10ZXN0J1xuICB9KTtcblxuICAvLyBUZXN0IFN0ZXAgRnVuY3Rpb25zXG4gIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTdGVwRnVuY3Rpb25zOjpTdGF0ZU1hY2hpbmUnLCB7XG4gICAgU3RhdGVNYWNoaW5lTmFtZTogJ2RhdGEtcGlwZWxpbmUtdGVzdCdcbiAgfSk7XG5cbiAgLy8gVGVzdCBTTlMgVG9waWNcbiAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNOUzo6VG9waWMnLCB7XG4gICAgVG9waWNOYW1lOiAnZXJyb3Itbm90aWZpY2F0aW9ucy10ZXN0J1xuICB9KTtcbn0pOyJdfQ==