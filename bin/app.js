#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("aws-cdk-lib");
const energy_auction_stack_1 = require("../lib/energy-auction-stack");
const app = new cdk.App();
const environment = process.env.ENVIRONMENT || 'dev';
// Complete Infrastructure Stack (includes CI/CD pipeline)
new energy_auction_stack_1.EntrixEnergyAuctionStack(app, `EntrixEnergyAuctionStack-${environment}`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'eu-west-1'
    },
    environment: environment,
    // GitHub connection ARN for CI/CD pipeline
    githubConnectionArn: 'arn:aws:codeconnections:eu-west-1:844682013548:connection/2bdacb93-aec6-4509-b83f-5cb0aa78c25a'
});
// Separate CI/CD Pipeline Stack (OPTIONAL - now included in main stack)
// Keep this commented out since pipeline is now in the main stack
/*
new PipelineStack(app, `PipelineStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-west-1'
  },
  environment: environment,
  githubConnectionArn: 'arn:aws:codeconnections:eu-west-1:844682013548:connection/2bdacb93-aec6-4509-b83f-5cb0aa78c25a'
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLG1DQUFtQztBQUNuQyxzRUFBdUU7QUFHdkUsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLElBQUksS0FBSyxDQUFDO0FBRXJELDBEQUEwRDtBQUMxRCxJQUFJLCtDQUF3QixDQUFDLEdBQUcsRUFBRSw0QkFBNEIsV0FBVyxFQUFFLEVBQUU7SUFDM0UsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO1FBQ3hDLE1BQU0sRUFBRSxXQUFXO0tBQ3BCO0lBQ0QsV0FBVyxFQUFFLFdBQVc7SUFDeEIsMkNBQTJDO0lBQzNDLG1CQUFtQixFQUFFLGdHQUFnRztDQUN0SCxDQUFDLENBQUM7QUFFSCx3RUFBd0U7QUFDeEUsa0VBQWtFO0FBQ2xFOzs7Ozs7Ozs7RUFTRTtBQUVGLDRDQUE0QztBQUM1QywwREFBMEQ7QUFDMUQsK0JBQStCO0FBRS9COzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUFvQ0U7QUFFRixrREFBa0Q7QUFDbEQsa0RBQWtEO0FBRWxEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUEwQ0UiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgRW50cml4RW5lcmd5QXVjdGlvblN0YWNrIH0gZnJvbSAnLi4vbGliL2VuZXJneS1hdWN0aW9uLXN0YWNrJztcbmltcG9ydCB7IFBpcGVsaW5lU3RhY2sgfSBmcm9tICcuLi9saWIvcGlwZWxpbmUtc3RhY2snO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG5jb25zdCBlbnZpcm9ubWVudCA9IHByb2Nlc3MuZW52LkVOVklST05NRU5UIHx8ICdkZXYnO1xuXG4vLyBDb21wbGV0ZSBJbmZyYXN0cnVjdHVyZSBTdGFjayAoaW5jbHVkZXMgQ0kvQ0QgcGlwZWxpbmUpXG5uZXcgRW50cml4RW5lcmd5QXVjdGlvblN0YWNrKGFwcCwgYEVudHJpeEVuZXJneUF1Y3Rpb25TdGFjay0ke2Vudmlyb25tZW50fWAsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246ICdldS13ZXN0LTEnXG4gIH0sXG4gIGVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgLy8gR2l0SHViIGNvbm5lY3Rpb24gQVJOIGZvciBDSS9DRCBwaXBlbGluZVxuICBnaXRodWJDb25uZWN0aW9uQXJuOiAnYXJuOmF3czpjb2RlY29ubmVjdGlvbnM6ZXUtd2VzdC0xOjg0NDY4MjAxMzU0ODpjb25uZWN0aW9uLzJiZGFjYjkzLWFlYzYtNDUwOS1iODNmLTVjYjBhYTc4YzI1YSdcbn0pO1xuXG4vLyBTZXBhcmF0ZSBDSS9DRCBQaXBlbGluZSBTdGFjayAoT1BUSU9OQUwgLSBub3cgaW5jbHVkZWQgaW4gbWFpbiBzdGFjaylcbi8vIEtlZXAgdGhpcyBjb21tZW50ZWQgb3V0IHNpbmNlIHBpcGVsaW5lIGlzIG5vdyBpbiB0aGUgbWFpbiBzdGFja1xuLypcbm5ldyBQaXBlbGluZVN0YWNrKGFwcCwgYFBpcGVsaW5lU3RhY2stJHtlbnZpcm9ubWVudH1gLCB7XG4gIGVudjoge1xuICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgcmVnaW9uOiAnZXUtd2VzdC0xJ1xuICB9LFxuICBlbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gIGdpdGh1YkNvbm5lY3Rpb25Bcm46ICdhcm46YXdzOmNvZGVjb25uZWN0aW9uczpldS13ZXN0LTE6ODQ0NjgyMDEzNTQ4OmNvbm5lY3Rpb24vMmJkYWNiOTMtYWVjNi00NTA5LWI4M2YtNWNiMGFhNzhjMjVhJ1xufSk7XG4qL1xuXG4vLyBNVUxUSVBMRSBFTlZJUk9OTUVOVFMgRkVBVFVSRSAoQ09NTUVOVEVEKVxuLy8gVW5jb21tZW50IGJlbG93IHRvIGRlcGxveSBtdWx0aXBsZSBlbnZpcm9ubWVudHMgYXQgb25jZVxuLy8gVXNlZnVsIGZvcjogY2RrIGRlcGxveSAtLWFsbFxuXG4vKlxuLy8gRGV2ZWxvcG1lbnQgRW52aXJvbm1lbnRcbm5ldyBFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2soYXBwLCAnRW50cml4RW5lcmd5QXVjdGlvblN0YWNrLWRldicsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246ICdldS13ZXN0LTEnXG4gIH0sXG4gIGVudmlyb25tZW50OiAnZGV2J1xufSk7XG5cbi8vIFN0YWdpbmcgRW52aXJvbm1lbnRcbm5ldyBFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2soYXBwLCAnRW50cml4RW5lcmd5QXVjdGlvblN0YWNrLXN0YWdpbmcnLCB7XG4gIGVudjoge1xuICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgcmVnaW9uOiAnZXUtd2VzdC0xJ1xuICB9LFxuICBlbnZpcm9ubWVudDogJ3N0YWdpbmcnXG59KTtcblxuLy8gUHJvZHVjdGlvbiBFbnZpcm9ubWVudFxubmV3IEVudHJpeEVuZXJneUF1Y3Rpb25TdGFjayhhcHAsICdFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2stcHJvZCcsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246ICdldS13ZXN0LTEnICAvLyBvciAndXMtZWFzdC0xJyBmb3IgcHJvZFxuICB9LFxuICBlbnZpcm9ubWVudDogJ3Byb2QnXG59KTtcblxuLy8gTXVsdGktcmVnaW9uIFByb2R1Y3Rpb24gKEFkdmFuY2VkKVxubmV3IEVudHJpeEVuZXJneUF1Y3Rpb25TdGFjayhhcHAsICdFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2stcHJvZC11cycsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246ICd1cy1lYXN0LTEnXG4gIH0sXG4gIGVudmlyb25tZW50OiAncHJvZCdcbn0pO1xuKi9cblxuLy8gRU5WSVJPTk1FTlQtU1BFQ0lGSUMgQ09ORklHVVJBVElPTlMgKENPTU1FTlRFRClcbi8vIFVuY29tbWVudCB0byBjdXN0b21pemUgc2V0dGluZ3MgcGVyIGVudmlyb25tZW50XG5cbi8qXG5pbnRlcmZhY2UgRW52aXJvbm1lbnRDb25maWcge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICByZWdpb246IHN0cmluZztcbiAgYWNjb3VudD86IHN0cmluZztcbiAgc2NoZWR1bGVEdXJhdGlvbj86IG51bWJlcjsgIC8vIFBpcGVsaW5lIHNjaGVkdWxlIGluIGhvdXJzXG4gIHJldGVudGlvbkRheXM/OiBudW1iZXI7ICAgICAvLyBMb2cgcmV0ZW50aW9uXG59XG5cbmNvbnN0IGVudmlyb25tZW50czogRW52aXJvbm1lbnRDb25maWdbXSA9IFtcbiAge1xuICAgIGVudmlyb25tZW50OiAnZGV2JyxcbiAgICByZWdpb246ICdldS13ZXN0LTEnLFxuICAgIHNjaGVkdWxlRHVyYXRpb246IDEsICAgICAgLy8gUnVuIGV2ZXJ5IGhvdXIgaW4gZGV2XG4gICAgcmV0ZW50aW9uRGF5czogNyAgICAgICAgICAvLyBLZWVwIGxvZ3MgZm9yIDcgZGF5c1xuICB9LFxuICB7XG4gICAgZW52aXJvbm1lbnQ6ICdzdGFnaW5nJyxcbiAgICByZWdpb246ICdldS13ZXN0LTEnLFxuICAgIHNjaGVkdWxlRHVyYXRpb246IDQsICAgICAgLy8gUnVuIGV2ZXJ5IDQgaG91cnMgaW4gc3RhZ2luZ1xuICAgIHJldGVudGlvbkRheXM6IDMwICAgICAgICAgLy8gS2VlcCBsb2dzIGZvciAzMCBkYXlzXG4gIH0sXG4gIHtcbiAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgIHJlZ2lvbjogJ2V1LXdlc3QtMScsXG4gICAgc2NoZWR1bGVEdXJhdGlvbjogMjQsICAgICAvLyBSdW4gb25jZSBkYWlseSBpbiBwcm9kXG4gICAgcmV0ZW50aW9uRGF5czogOTAgICAgICAgICAvLyBLZWVwIGxvZ3MgZm9yIDkwIGRheXNcbiAgfVxuXTtcblxuLy8gRGVwbG95IGFsbCBlbnZpcm9ubWVudHNcbmVudmlyb25tZW50cy5mb3JFYWNoKGNvbmZpZyA9PiB7XG4gIG5ldyBFbnRyaXhFbmVyZ3lBdWN0aW9uU3RhY2soYXBwLCBgRW50cml4RW5lcmd5QXVjdGlvblN0YWNrLSR7Y29uZmlnLmVudmlyb25tZW50fWAsIHtcbiAgICBlbnY6IHtcbiAgICAgIGFjY291bnQ6IGNvbmZpZy5hY2NvdW50IHx8IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgICByZWdpb246IGNvbmZpZy5yZWdpb25cbiAgICB9LFxuICAgIGVudmlyb25tZW50OiBjb25maWcuZW52aXJvbm1lbnQsXG4gICAgc2NoZWR1bGVEdXJhdGlvbjogY29uZmlnLnNjaGVkdWxlRHVyYXRpb24sXG4gICAgcmV0ZW50aW9uRGF5czogY29uZmlnLnJldGVudGlvbkRheXNcbiAgfSk7XG59KTtcbiovIl19