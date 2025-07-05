#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("aws-cdk-lib");
const energy_auction_stack_1 = require("../lib/energy-auction-stack");
const pipeline_stack_1 = require("../lib/pipeline-stack");
const app = new cdk.App();
const environment = process.env.ENVIRONMENT || 'dev';
// Core Infrastructure Stack
new energy_auction_stack_1.EntrixEnergyAuctionStack(app, `EntrixEnergyAuctionStack-${environment}`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'eu-west-1'
    },
    environment: environment
});
// CI/CD Pipeline Stack - AWS CodePipeline for automated deployments
new pipeline_stack_1.PipelineStack(app, `PipelineStack-${environment}`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'eu-west-1'
    },
    environment: environment
});
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLG1DQUFtQztBQUNuQyxzRUFBdUU7QUFDdkUsMERBQXNEO0FBRXRELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxJQUFJLEtBQUssQ0FBQztBQUVyRCw0QkFBNEI7QUFDNUIsSUFBSSwrQ0FBd0IsQ0FBQyxHQUFHLEVBQUUsNEJBQTRCLFdBQVcsRUFBRSxFQUFFO0lBQzNFLEdBQUcsRUFBRTtRQUNILE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQjtRQUN4QyxNQUFNLEVBQUUsV0FBVztLQUNwQjtJQUNELFdBQVcsRUFBRSxXQUFXO0NBQ3pCLENBQUMsQ0FBQztBQUVILG9FQUFvRTtBQUNwRSxJQUFJLDhCQUFhLENBQUMsR0FBRyxFQUFFLGlCQUFpQixXQUFXLEVBQUUsRUFBRTtJQUNyRCxHQUFHLEVBQUU7UUFDSCxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7UUFDeEMsTUFBTSxFQUFFLFdBQVc7S0FDcEI7SUFDRCxXQUFXLEVBQUUsV0FBVztDQUN6QixDQUFDLENBQUM7QUFFSCw0Q0FBNEM7QUFDNUMsMERBQTBEO0FBQzFELCtCQUErQjtBQUUvQjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBb0NFO0FBRUYsa0RBQWtEO0FBQ2xELGtEQUFrRDtBQUVsRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBMENFIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IEVudHJpeEVuZXJneUF1Y3Rpb25TdGFjayB9IGZyb20gJy4uL2xpYi9lbmVyZ3ktYXVjdGlvbi1zdGFjayc7XG5pbXBvcnQgeyBQaXBlbGluZVN0YWNrIH0gZnJvbSAnLi4vbGliL3BpcGVsaW5lLXN0YWNrJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuY29uc3QgZW52aXJvbm1lbnQgPSBwcm9jZXNzLmVudi5FTlZJUk9OTUVOVCB8fCAnZGV2JztcblxuLy8gQ29yZSBJbmZyYXN0cnVjdHVyZSBTdGFja1xubmV3IEVudHJpeEVuZXJneUF1Y3Rpb25TdGFjayhhcHAsIGBFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2stJHtlbnZpcm9ubWVudH1gLCB7XG4gIGVudjoge1xuICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgcmVnaW9uOiAnZXUtd2VzdC0xJ1xuICB9LFxuICBlbnZpcm9ubWVudDogZW52aXJvbm1lbnRcbn0pO1xuXG4vLyBDSS9DRCBQaXBlbGluZSBTdGFjayAtIEFXUyBDb2RlUGlwZWxpbmUgZm9yIGF1dG9tYXRlZCBkZXBsb3ltZW50c1xubmV3IFBpcGVsaW5lU3RhY2soYXBwLCBgUGlwZWxpbmVTdGFjay0ke2Vudmlyb25tZW50fWAsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246ICdldS13ZXN0LTEnXG4gIH0sXG4gIGVudmlyb25tZW50OiBlbnZpcm9ubWVudFxufSk7XG5cbi8vIE1VTFRJUExFIEVOVklST05NRU5UUyBGRUFUVVJFIChDT01NRU5URUQpXG4vLyBVbmNvbW1lbnQgYmVsb3cgdG8gZGVwbG95IG11bHRpcGxlIGVudmlyb25tZW50cyBhdCBvbmNlXG4vLyBVc2VmdWwgZm9yOiBjZGsgZGVwbG95IC0tYWxsXG5cbi8qXG4vLyBEZXZlbG9wbWVudCBFbnZpcm9ubWVudFxubmV3IEVudHJpeEVuZXJneUF1Y3Rpb25TdGFjayhhcHAsICdFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2stZGV2Jywge1xuICBlbnY6IHtcbiAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgIHJlZ2lvbjogJ2V1LXdlc3QtMSdcbiAgfSxcbiAgZW52aXJvbm1lbnQ6ICdkZXYnXG59KTtcblxuLy8gU3RhZ2luZyBFbnZpcm9ubWVudFxubmV3IEVudHJpeEVuZXJneUF1Y3Rpb25TdGFjayhhcHAsICdFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2stc3RhZ2luZycsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246ICdldS13ZXN0LTEnXG4gIH0sXG4gIGVudmlyb25tZW50OiAnc3RhZ2luZydcbn0pO1xuXG4vLyBQcm9kdWN0aW9uIEVudmlyb25tZW50XG5uZXcgRW50cml4RW5lcmd5QXVjdGlvblN0YWNrKGFwcCwgJ0VudHJpeEVuZXJneUF1Y3Rpb25TdGFjay1wcm9kJywge1xuICBlbnY6IHtcbiAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgIHJlZ2lvbjogJ2V1LXdlc3QtMScgIC8vIG9yICd1cy1lYXN0LTEnIGZvciBwcm9kXG4gIH0sXG4gIGVudmlyb25tZW50OiAncHJvZCdcbn0pO1xuXG4vLyBNdWx0aS1yZWdpb24gUHJvZHVjdGlvbiAoQWR2YW5jZWQpXG5uZXcgRW50cml4RW5lcmd5QXVjdGlvblN0YWNrKGFwcCwgJ0VudHJpeEVuZXJneUF1Y3Rpb25TdGFjay1wcm9kLXVzJywge1xuICBlbnY6IHtcbiAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgIHJlZ2lvbjogJ3VzLWVhc3QtMSdcbiAgfSxcbiAgZW52aXJvbm1lbnQ6ICdwcm9kJ1xufSk7XG4qL1xuXG4vLyBFTlZJUk9OTUVOVC1TUEVDSUZJQyBDT05GSUdVUkFUSU9OUyAoQ09NTUVOVEVEKVxuLy8gVW5jb21tZW50IHRvIGN1c3RvbWl6ZSBzZXR0aW5ncyBwZXIgZW52aXJvbm1lbnRcblxuLypcbmludGVyZmFjZSBFbnZpcm9ubWVudENvbmZpZyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIHJlZ2lvbjogc3RyaW5nO1xuICBhY2NvdW50Pzogc3RyaW5nO1xuICBzY2hlZHVsZUR1cmF0aW9uPzogbnVtYmVyOyAgLy8gUGlwZWxpbmUgc2NoZWR1bGUgaW4gaG91cnNcbiAgcmV0ZW50aW9uRGF5cz86IG51bWJlcjsgICAgIC8vIExvZyByZXRlbnRpb25cbn1cblxuY29uc3QgZW52aXJvbm1lbnRzOiBFbnZpcm9ubWVudENvbmZpZ1tdID0gW1xuICB7XG4gICAgZW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgIHJlZ2lvbjogJ2V1LXdlc3QtMScsXG4gICAgc2NoZWR1bGVEdXJhdGlvbjogMSwgICAgICAvLyBSdW4gZXZlcnkgaG91ciBpbiBkZXZcbiAgICByZXRlbnRpb25EYXlzOiA3ICAgICAgICAgIC8vIEtlZXAgbG9ncyBmb3IgNyBkYXlzXG4gIH0sXG4gIHtcbiAgICBlbnZpcm9ubWVudDogJ3N0YWdpbmcnLFxuICAgIHJlZ2lvbjogJ2V1LXdlc3QtMScsXG4gICAgc2NoZWR1bGVEdXJhdGlvbjogNCwgICAgICAvLyBSdW4gZXZlcnkgNCBob3VycyBpbiBzdGFnaW5nXG4gICAgcmV0ZW50aW9uRGF5czogMzAgICAgICAgICAvLyBLZWVwIGxvZ3MgZm9yIDMwIGRheXNcbiAgfSxcbiAge1xuICAgIGVudmlyb25tZW50OiAncHJvZCcsXG4gICAgcmVnaW9uOiAnZXUtd2VzdC0xJyxcbiAgICBzY2hlZHVsZUR1cmF0aW9uOiAyNCwgICAgIC8vIFJ1biBvbmNlIGRhaWx5IGluIHByb2RcbiAgICByZXRlbnRpb25EYXlzOiA5MCAgICAgICAgIC8vIEtlZXAgbG9ncyBmb3IgOTAgZGF5c1xuICB9XG5dO1xuXG4vLyBEZXBsb3kgYWxsIGVudmlyb25tZW50c1xuZW52aXJvbm1lbnRzLmZvckVhY2goY29uZmlnID0+IHtcbiAgbmV3IEVudHJpeEVuZXJneUF1Y3Rpb25TdGFjayhhcHAsIGBFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2stJHtjb25maWcuZW52aXJvbm1lbnR9YCwge1xuICAgIGVudjoge1xuICAgICAgYWNjb3VudDogY29uZmlnLmFjY291bnQgfHwgcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICAgIHJlZ2lvbjogY29uZmlnLnJlZ2lvblxuICAgIH0sXG4gICAgZW52aXJvbm1lbnQ6IGNvbmZpZy5lbnZpcm9ubWVudCxcbiAgICBzY2hlZHVsZUR1cmF0aW9uOiBjb25maWcuc2NoZWR1bGVEdXJhdGlvbixcbiAgICByZXRlbnRpb25EYXlzOiBjb25maWcucmV0ZW50aW9uRGF5c1xuICB9KTtcbn0pO1xuKi8iXX0=