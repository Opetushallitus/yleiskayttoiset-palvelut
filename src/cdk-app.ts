import * as cdk from "aws-cdk-lib";
import { DnsStack } from "./dns";
import * as constructs from "constructs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Duration } from "aws-cdk-lib";

class CdkApp extends cdk.App {
  constructor() {
    super();
    const stackProps = {
      env: {
        account: process.env.CDK_DEPLOY_TARGET_ACCOUNT,
        region: process.env.CDK_DEPLOY_TARGET_REGION,
      },
    };

    new DnsStack(this, "DnsStack", stackProps);
    new AlarmStack(this, "AlarmStack", stackProps);
    new VpcStack(this, "VpcStack", stackProps);
    new EcsStack(this, "EcsStack", stackProps);
  }
}

class AlarmStack extends cdk.Stack {
  constructor(scope: constructs.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const alarmsToSlackLambda = this.createAlarmsToSlackLambda();
    const alarmTopic = this.createAlarmTopic();

    alarmTopic.addSubscription(
      new subscriptions.LambdaSubscription(alarmsToSlackLambda),
    );
  }

  createAlarmTopic() {
    return new sns.Topic(this, "AlarmTopic", {
      topicName: "alarm",
    });
  }

  createAlarmsToSlackLambda() {
    const alarmsToSlack = new lambda.Function(this, "AlarmsToSlack", {
      functionName: "alarms-to-slack",
      code: lambda.Code.fromAsset("alarms-to-slack"),
      handler: "alarms-to-slack.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: Duration.seconds(30),
    });

    // https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html
    const parametersAndSecretsExtension =
      lambda.LayerVersion.fromLayerVersionArn(
        this,
        "ParametersAndSecretsLambdaExtension",
        "arn:aws:lambda:eu-west-1:015030872274:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:11",
      );

    alarmsToSlack.addLayers(parametersAndSecretsExtension);
    secretsmanager.Secret.fromSecretNameV2(
      this,
      "slack-webhook",
      "slack-webhook",
    ).grantRead(alarmsToSlack);

    return alarmsToSlack;
  }
}

class VpcStack extends cdk.Stack {
  constructor(scope: constructs.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const vpc = this.createVpc();
    this.createBastionHost(vpc);
  }

  createBastionHost(vpc: ec2.IVpc) {
    return new ec2.BastionHostLinux(this, "BastionHost", {
      instanceName: "bastion-host",
      vpc,
    });
  }

  createVpc() {
    const vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: "vpc",
      subnetConfiguration: [
        {
          name: "Ingress",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: "Application",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          name: "Database",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      maxAzs: 3,
      natGateways: 3,
    });
    vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });
    return vpc;
  }
}

class EcsStack extends cdk.Stack {
  constructor(scope: constructs.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", { vpcName: "vpc" });
    this.createEcsCluster(vpc);
  }

  createEcsCluster(vpc: ec2.IVpc) {
    return new ecs.Cluster(this, "cluster", {
      clusterName: "cluster",
      vpc,
    });
  }
}

const app = new CdkApp();
app.synth();
