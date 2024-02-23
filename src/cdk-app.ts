import * as cdk from "aws-cdk-lib";
import { DnsStack } from "./dns";

class CdkApp extends cdk.App {
  constructor() {
    super();
    const env = {
      account: process.env.CDK_DEPLOY_TARGET_ACCOUNT,
      region: process.env.CDK_DEPLOY_TARGET_REGION,
    };
    new DnsStack(this, "DnsStack", {
      env: env,
    });
  }
}

const app = new CdkApp();
app.synth();
