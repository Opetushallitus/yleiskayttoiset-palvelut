import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as route53 from "aws-cdk-lib/aws-route53";

export class DnsStack extends cdk.Stack {
  readonly hostedZone: route53.IHostedZone
  constructor(scope: constructs.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const zoneName = ssm.StringParameter.valueFromLookup(this, "zoneName");

    this.hostedZone = new route53.HostedZone(this, "HostedZone", {
      zoneName,
    });
  }
}
