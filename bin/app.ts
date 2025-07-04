#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EntrixEnergyAuctionStack } from '../lib/energy-auction-stack';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

const environment = process.env.ENVIRONMENT || 'dev';

// Core Infrastructure Stack
new EntrixEnergyAuctionStack(app, `EntrixEnergyAuctionStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-1'
  },
  environment: environment
});

// CI/CD Pipeline Stack (OPTIONAL - Deploy separately)
// Uncomment and deploy this after the core infrastructure is working
/*
new PipelineStack(app, `PipelineStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-1'
  },
  environment: environment
});
*/

// MULTIPLE ENVIRONMENTS FEATURE (COMMENTED)
// Uncomment below to deploy multiple environments at once
// Useful for: cdk deploy --all

/*
// Development Environment
new EntrixEnergyAuctionStack(app, 'EntrixEnergyAuctionStack-dev', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-1'
  },
  environment: 'dev'
});

// Staging Environment
new EntrixEnergyAuctionStack(app, 'EntrixEnergyAuctionStack-staging', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-1'
  },
  environment: 'staging'
});

// Production Environment
new EntrixEnergyAuctionStack(app, 'EntrixEnergyAuctionStack-prod', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-1'  // or 'us-east-1' for prod
  },
  environment: 'prod'
});

// Multi-region Production (Advanced)
new EntrixEnergyAuctionStack(app, 'EntrixEnergyAuctionStack-prod-us', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1'
  },
  environment: 'prod'
});
*/

// ENVIRONMENT-SPECIFIC CONFIGURATIONS (COMMENTED)
// Uncomment to customize settings per environment

/*
interface EnvironmentConfig {
  environment: string;
  region: string;
  account?: string;
  scheduleDuration?: number;  // Pipeline schedule in hours
  retentionDays?: number;     // Log retention
}

const environments: EnvironmentConfig[] = [
  {
    environment: 'dev',
    region: 'eu-west-1',
    scheduleDuration: 1,      // Run every hour in dev
    retentionDays: 7          // Keep logs for 7 days
  },
  {
    environment: 'staging',
    region: 'eu-west-1',
    scheduleDuration: 4,      // Run every 4 hours in staging
    retentionDays: 30         // Keep logs for 30 days
  },
  {
    environment: 'prod',
    region: 'eu-west-1',
    scheduleDuration: 24,     // Run once daily in prod
    retentionDays: 90         // Keep logs for 90 days
  }
];

// Deploy all environments
environments.forEach(config => {
  new EntrixEnergyAuctionStack(app, `EntrixEnergyAuctionStack-${config.environment}`, {
    env: {
      account: config.account || process.env.CDK_DEFAULT_ACCOUNT,
      region: config.region
    },
    environment: config.environment,
    scheduleDuration: config.scheduleDuration,
    retentionDays: config.retentionDays
  });
});
*/