import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface EnergyAuctionStackProps extends cdk.StackProps {
    environment: string;
}
export declare class EnergyAuctionStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: EnergyAuctionStackProps);
}
