# Coding Challenge Guidelines
## Legend
Our organization is participating in an energy market auction and has a service that generates and submits orders to the Auction Platform provider. Software Engineers and Data Scientists have just completed working on the logic of the service that accepts orders via an API and stores them in a DB. Another service then submits them to the Auction Platform. Data Scientists came up with the logic for Data Pipeline to retrieve and process the results and store them in an S3 bucket. You are asked to provide the Infrastructure to deploy all required resources to AWS using aws-cdk for IaC (with Typescript).
## The task

There is an API lambda that processes POST requests and stores data in a Database.

Request body example:
` 
[ { "record_id": "unique_id_1", "parameter_1": "abc", "parameter_2": 4, },{ "record_id": "unique_id_2", "parameter_1": "def", "parameter_2": 2.1, }, ]
`

The Data Pipeline should be triggered by schedule and execute several lambdas in a row. Lambda A that randomly generates True/False value and returns:


```
// Lambda with ready results 
{ 
  "results": true,
  "orders": [
   { 
      "order": "accepted"
   },
   {
     "order": "rejected" 
   }
   ]
 } 
// OR 
// Lambda with results not ready 
{ 
  "results": false 
}
```
 

Lambda B that gets order from the event and raised an error, if the order status is rejected. Otherwise, it should be able to store results in S3 Bucket called “order-results” .

## Requirements:
The data pipeline should fulfill the following requirements: 

- There should be a validation of the Lambda A output checking the results field. If the results are false, Lambda A should be re-triggered until the results are true.
- If Lambda B raises an error, there should be a notification sent to a Slack Channel or similar app (don’t have to link the actual messaging app).
- Data in the database should expire after 24 hours.
- Create AWS deployment Pipeline that deploys the app from our GitHub repo to our AWS account using CodePipeline.
- All merges to master should automatically deploy the code to Dev environment.
- Create a simple GitHub Actions workflow to run on merge to master.
- (Optional) Write tests for aws cdk constructs and ensure that the tests are executed in GitHub Actions stage.
- (Optional) We should receive a Slack notification (don’t have to link the actual messaging app) if the Deployment Pipeline fails.

### Tools

List of tools:

- AWS (Serverless)
- Python
- CDK (Typescript)
- Github Actions/Code Suites

### Important information 
- The whole solution should be serverless.
- Code for Lambda A, B and post has been provided. The provided Lambda code should only be completed and not modified.
- Feel free to add additional Lambda Functions if deemed necessary.
- Everything should be deployed to *eu-west-1* region.
- If additional IAM permissions are needed, feel free to reach out to us to update the designated role.
- We will provide the AWS sandbox environment for deploying the solution. We will share it with your email address.

## Evaluation
- Software/Cloud Engineering Best Practices
- Completeness: Are all features fully implemented?
- AWS Services: Are the most suitable AWS services chosen?
- Robustness/Scalability/Cost-Effectiveness: Does the solution demonstrate reliability, scalability, and cost-efficiency?

## CodeSubmit
Please organize, design, test, and document your code as if it were going into production - then push your changes to the master branch.
Have fun coding!

The Entrix Team