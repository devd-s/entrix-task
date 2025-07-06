

# Entrix Energy Auction - Implementation Steps

## Overview
Document outlines the implementation steps I took to build a serverless energy auction system on AWS using CDK (TypeScript) as mentioned on the provided README.md.

## Architecture Components

### 1. Lambda Functions
- **POST Lambda** (`src/post_lambda/app.py`): Handling API requests & storing orders in DynamoDB with TTL of 24 hours
- **Lambda A** (`src/lambda_a/app.py`): Generates random auction results as this was provided
- **Lambda B** (`src/lambda_b/app.py`): Processes orders and saves to S3 bucket

### 2. Infrastructure (CDK)
- **API Gateway**: RESTful API endpoint for order submission
- **DynamoDB**: Orders table with 24-hour TTL 
- **S3 Bucket**: Storage for order results and artifacts
- **Step Functions**: For Orchestrating data pipeline
- **SNS**: Error notifications
- **EventBridge**: Scheduled pipeline execution for 1 hour
- **CodePipeline**: CI/CD deployment pipeline when code is pushed to github

## Steps

### Step 1: Project Setup
```bash
# Initialize CDK project structure
npm init -y
npm install aws-cdk-lib constructs
npm install -D typescript @types/node jest ts-jest @types/jest
```

**Files Created:**
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `cdk.json` - CDK application configuration
- `jest.config.js` - Testing configuration

### Step 2: Lambda Function Implementation

**POST Lambda (`src/post_lambda/app.py`):**
```python
# Completed to save_to_db function
def save_to_db(records: list[dict[str, Any]]):
    import boto3
    import time
    
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(TABLE_NAME)
    
    # Add TTL (24 hours from now)
    ttl = int(time.time()) + (24 * 60 * 60)
    
    with table.batch_writer() as batch:
        for record in records:
            record['ttl'] = ttl
            batch.put_item(Item=record)
```

**Lambda B (`src/lambda_b/app.py`):**
```python
# Completed to save_to_s3 function
def save_to_s3(data: dict[str, Any], filename: str):
    import boto3
    import json
    
    s3_client = boto3.client('s3')
    json_data = json.dumps(data, indent=2)
    
    s3_client.put_object(
        Bucket=LOG_BUCKET,
        Key=f"{filename}.json",
        Body=json_data,
        ContentType='application/json'
    )
```

### Step 3: CDK Infrastructure (`lib/energy-auction-stack.ts`)

**Key Infra Components:**

1. **S3 Bucket for Results**
   - Name: `order-results-{environment}-{account-id}`
   - Versioning enabled also
   - Auto-delete objects when stack is deleted

2. **DynamoDB Table**
   - Name: `orders-{environment}`
   - Partition key: `record_id`
   - TTL attribute: `ttl` (24 hours)

3. **Step Functions State Machine**
   - Implemented retry logic for Lambda A
   - Processing orders through Lambda B
   - Error handling is done via SNS notifications

4. **API Gateway**
   - POST `/orders` endpoint
   - Lambda integration for order processing

5. **EventBridge Schedule**
   - Triggers pipeline every hour as required


### Step 4: CI/CD Pipeline

**GitHub Actions (`.github/workflows/deploy.yml`):**
- Triggering on master branch pushes
- Runs CDK synth
- Deploys to dev environment
- Slack notifications for success/failure are mentioned

**AWS CodePipeline:**
- GitHub source integration
- CodeBuild for testing & deployment when a push happens on master branch

## Pipeline Stack (lib/pipeline-stack.ts)

Pipeline stack is handling CI/CD automation:

- **GitHub Integration**: Using CodeStar Connections for secure repository access
- **Multi-Environment Support**: Deploys to dev/staging/prod environments , multiple env's can be extended based on needs 
- **Artifact Management**: Stores build artifacts in S3

### Key Components:

#### Source Stage
- **CodeStar Connection**: Secure integration with GitHub repository 
- **Branch Monitoring**: Watches `master` branch for changes

#### Build Stage
- **CodeBuild Project**: `entrix-energy-auction-build-{environment}-{uniqueId}` with Node.js 18 runtime
- **Build Phases**:
  - `install`: Installing CDK & dependencies via `npm ci`
  - `pre_build`: Running tests & synthesize CDK templates
  - `build`: Deploying to target envs via `cdk deploy`
- **Environment Variables**: Configurable for different deployment targets based on needs

#### Pipeline Configuration
- **Unique Naming**: Timestamp-based unique IDs to avoid conflicts
- **Artifact Management**: Source and build artifacts handled automatically
- **GitHub Integration**: Secure CodeStar Connections instead of OAuth tokens
- **Pipeline Name**: For tracking & monitoring purposes

## Data Flow

1. **For Order Submission**: Client → API Gateway → POST Lambda → DynamoDB
2. **Of Pipeline Execution**: EventBridge → Step Functions → Lambda A
3. **How Results are getting processed**: Lambda A → Lambda B → S3 (if accepted) / SNS (if rejected)
4. **Retrying Logic**: Lambda A returns false → retry until true

## AWS Services Used

- **Lambda**: For Serverless computing
- **API Gateway**: REST API mgmt
- **DynamoDB**: NoSQL database with TTL of 24 hours
- **S3**: Object storage
- **Step Functions**: For Workflow orchestration
- **SNS**: For Notification service
- **EventBridge**: For Event scheduling
- **CodePipeline**: For CI/CD pipeline
- **CodeBuild**: For Building 
- **IAM**: For Identity and access management
- **AWS SSM Parameter Store**: For storing variables

## Security Considerations

- IAM roles with least privilege access
- S3 bucket encryption enabled
- API Gateway throttling and validation
- Lambda environment variables for configuration
- Secure secret management for GitHub tokens

## Cost Optimization can be done for prod

- Pay-per-request DynamoDB billing
- S3 lifecycle policies (can be added)
- Lambda timeout configurations
- Step Functions express workflows (can be upgraded)

## Monitoring and Observability

- Logging for all Lambda functions on CloudWatch
- Step Functions execution history
- API Gateway access logs 
- SNS delivery status logging 

## Deployment Instructions

1. **Prerequisites:**
   - AWS CLI configured
   - Node.js 18+ installed
   - GitHub repository created

2. **Local Development:**
   ```bash
   npm install
   npm run build
   npm test
   cdk synth
   ```

3. **Deployment:**
   ```bash
   cdk deploy --require-approval never
   ```

4. **GitHub Actions Setup:**
   - Add AWS credentials to GitHub secrets
   - Add Slack webhook URL for notifications
   - Push to master branch triggers deployment

# To check step function event bridge schedule is triggered
aws stepfunctions list-executions --state-machine-arn $STATE_MACHINE_ARN --region $AWS_REGION --max-items 10

