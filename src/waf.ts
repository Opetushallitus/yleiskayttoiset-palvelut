import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as construct from "constructs";
import * as cdk from "aws-cdk-lib";

const REGION_REQUIRED_FOR_CLOUDFRONT_WEB_ACLS = "us-east-1";

export class WafStack extends cdk.Stack {
    public webAcl: wafv2.CfnWebACL;

    constructor(scope: construct.Construct, id: string, props: cdk.StackProps & { allowedIps: string[] }) {
        super(scope, id, {
            env: {
                account: props.env?.account,
                region: REGION_REQUIRED_FOR_CLOUDFRONT_WEB_ACLS,
            },
            crossRegionReferences: true,
        });

        const ipSet = new wafv2.CfnIPSet(this, 'AllowedIPs', {
            addresses: props.allowedIps,
            ipAddressVersion: 'IPV4',
            scope: 'CLOUDFRONT',
            name: 'TrivyAllowedIPs',
        });

        this.webAcl = new wafv2.CfnWebACL(this, 'CloudfrontWebACL', {
            defaultAction: {
                block: {}
            },
            scope: 'CLOUDFRONT',
            visibilityConfig: {
                metricName: 'CloudfrontWebACL',
                sampledRequestsEnabled: true,
                cloudWatchMetricsEnabled: true,
            },
            rules: [
                {
                    name: 'AllowListedIPs',
                    priority: 0,
                    action: {
                        allow: {}
                    },
                    statement: {
                        ipSetReferenceStatement: {
                            arn: ipSet.attrArn
                        },
                    },
                    visibilityConfig: {
                        sampledRequestsEnabled: true,
                        cloudWatchMetricsEnabled: true,
                        metricName: 'AllowListedIPs',
                    },
                },
            ],
        });
    }
}