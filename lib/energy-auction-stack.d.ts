import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface EntrixEnergyAuctionStackProps extends cdk.StackProps {
    environment: string;
}
export declare class EntrixEnergyAuctionStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: EntrixEnergyAuctionStackProps);
}
