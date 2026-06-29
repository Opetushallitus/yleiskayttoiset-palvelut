import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as codestarconnections from "aws-cdk-lib/aws-codestarconnections";
import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfront_origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import {PipelineType} from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as constructs from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as events_targets from "aws-cdk-lib/aws-events-targets";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53_targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import {BucketAccessControl} from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import {DnsStack} from "./dns";
import * as clientssm from "@aws-sdk/client-ssm";
import * as waf from "./waf";

const TRIVY_BASIC_AUTH_HASH_KEY = "authorization-sha256";

class CdkAppUtil extends cdk.App {
  constructor(props: cdk.AppProps & { allowedIps: string[], allowedIpv6s: string[] }) {
    super(props);

    const env = {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    };
    const {hostedZone} = new DnsStack(this, "DnsStack", { env });
    new ContinousDeploymentStack(this, "ContinuousDeploymentStack", {
      env,
      hostedZone,
      allowedIps: props.allowedIps,
      allowedIpv6s: props.allowedIpv6s,
    });
  }
}

type ContinousDeploymentStackProps = cdk.StackProps & {
  hostedZone: route53.IHostedZone,
  allowedIps: string[],
  allowedIpv6s: string[],
}
class ContinousDeploymentStack extends cdk.Stack {
  constructor(scope: constructs.Construct, id: string, props: ContinousDeploymentStackProps) {
    super(scope, id, props);
    const connection = new codestarconnections.CfnConnection(
      this,
      "GithubConnection",
      {
        connectionName: "GithubConnection",
        providerType: "GitHub",
      },
    );
    new ssm.StringParameter(this, 'CodeStarConnectionArn', {
      parameterName: 'code-star-connection-arn',
      stringValue: connection.attrConnectionArn,
    });

    new TrivyRunnerStack(
      this,
      "TrivyRunnerStack",
      connection,
      props.hostedZone,
      props.allowedIps,
      props.allowedIpv6s,
      props
    );

    new ContinousDeploymentPipelineStack(
      this,
      `HahtuvaContinuousDeploymentPipeline`,
      connection,
      "hahtuva",
      { owner: "Opetushallitus", name: "yleiskayttoiset-palvelut", branch: "main" },
      props,
    );
    new ContinousDeploymentPipelineStack(
      this,
      `DevContinuousDeploymentPipeline`,
      connection,
      "dev",
      { owner: "Opetushallitus", name: "yleiskayttoiset-palvelut", branch: "green-hahtuva" },
      props,
    );
    new ContinousDeploymentPipelineStack(
      this,
      `QaContinuousDeploymentPipeline`,
      connection,
      "qa",
      { owner: "Opetushallitus", name: "yleiskayttoiset-palvelut", branch: "green-dev" },
      props,
    );
    new ContinousDeploymentPipelineStack(
      this,
      `ProdContinuousDeploymentPipeline`,
      connection,
      "prod",
      { owner: "Opetushallitus", name: "yleiskayttoiset-palvelut", branch: "green-qa" },
      props,
    );
  }
}

class TrivyRunnerStack extends cdk.Stack {
  constructor(
    scope: constructs.Construct,
    id: string,
    connection: codestarconnections.CfnConnection,
    hostedZone: route53.IHostedZone,
    allowedIps: string[],
    allowedIpv6s: string[],
    props?: cdk.StackProps,
  ) {
    super(scope, id, {
      crossRegionReferences: true,
      ...props,
    });
    const bucket = new s3.Bucket(this, "TrivyResultBucket", {
      bucketName: "oph-yleiskayttoiset-trivy-results",
      accessControl: BucketAccessControl.PRIVATE,
    })
    const domainName = `trivy.util.yleiskayttoiset.opintopolku.fi`
    const CLOUDFRONT_CERTIFICATE_REGION = "us-east-1";
    const cert = new certificatemanager.DnsValidatedCertificate(this, "Certificate", {
      domainName,
      hostedZone,
      region: CLOUDFRONT_CERTIFICATE_REGION,
    })
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, "OriginAccessIdentity")
    bucket.grantRead(originAccessIdentity)

    const basicAuthKeyValueStore = new cloudfront.KeyValueStore(this, "BasicAuthKeyValueStore", {
      keyValueStoreName: "trivy-basic-auth",
      comment: `Populate ${TRIVY_BASIC_AUTH_HASH_KEY} out-of-band with the SHA-256 hash of the expected Authorization header.`,
    });
    const basicAuthFunction = new cloudfront.Function(this, "BasicAuthFunction", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      keyValueStore: basicAuthKeyValueStore,
      code: cloudfront.FunctionCode.fromInline(createBasicAuthFunctionCode(TRIVY_BASIC_AUTH_HASH_KEY)),
    });

    const wafStack = new waf.WafStack(this, "Waf", {
      allowedIps,
      allowedIpv6s,
      ...props
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "kaikki.html",
      domainNames: [domainName],
      certificate: cert,
      defaultBehavior: {
        origin: new cloudfront_origins.S3Origin(bucket, { originAccessIdentity }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: new cloudfront.CachePolicy(this, "CachePolicy", {
          defaultTtl: cdk.Duration.seconds(0),
          minTtl: cdk.Duration.seconds(0),
          maxTtl: cdk.Duration.seconds(0),
        }),
        functionAssociations: [
          {
            function: basicAuthFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      webAclId: wafStack.webAcl.attrArn,
    })
    new route53.ARecord(this, "CloudFrontDnsRecord", {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new route53_targets.CloudFrontTarget(distribution)
      )
    })

    const pipeline = new codepipeline.Pipeline(
      this,
      "TrivyRunnerPipeline",
      {
        pipelineName: "TrivyRunner",
        pipelineType: PipelineType.V1,
      },
    );

    new events.Rule(this, "TrivyRunnerSchedule", {
      schedule: events.Schedule.cron({ hour: "1/4", minute: "0" }),
      targets: [new events_targets.CodePipeline(pipeline)],
    });

    const sourceOutput = new codepipeline.Artifact();
    const sourceAction =
      new codepipeline_actions.CodeStarConnectionsSourceAction({
        actionName: "Source",
        connectionArn: connection.attrConnectionArn,
        codeBuildCloneOutput: true,
        owner: "Opetushallitus",
        repo: "yleiskayttoiset-palvelut",
        branch: "main",
        output: sourceOutput,
        triggerOnPush: false,
      });
    const sourceStage = pipeline.addStage({ stageName: "Source" });
    sourceStage.addAction(sourceAction);

    const trivyViews = [
      "yleiskayttoiset",
      "opiskelijavalinnat",
      "kaikki",
      "ehoks",
      "eperusteet",
      "kios",
      "koski",
      "kielitutkintorekisteri",
      "mpassid",
      "oppijan_henkilokohtaiset_palvelut",
      "tukipalvelut",
      "varda",
      "muut",
    ]
    const trivyProject = new codebuild.PipelineProject(
      this,
      `TrivyProject`,
      {
        projectName: `RunTrivy`,
        timeout: cdk.Duration.hours(2),
        concurrentBuildLimit: trivyViews.length,
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: codebuild.ComputeType.SMALL,
          privileged: true,
        },
        environmentVariables: {
          DOCKER_USERNAME: {
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
            value: "/docker/username",
          },
          DOCKER_PASSWORD: {
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
            value: "/docker/password",
          },
        },
        buildSpec: codebuild.BuildSpec.fromObject({
          version: "0.2",
          env: {
            "git-credential-helper": "yes",
          },
          phases: {
            pre_build: {
              commands: [
                "docker login --username $DOCKER_USERNAME --password $DOCKER_PASSWORD",
              ]
            },
            build: {
              commands: [`./run-trivy.sh`],
            },
          },
        }),
      },
    );
    bucket.grantReadWrite(trivyProject);
    trivyProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["cloudwatch:PutMetricData"],
      conditions: {
        StringEquals: {
          "cloudwatch:namespace": "Trivy",
        },
      },
      resources: ["*"],
    }));
    const stage = pipeline.addStage({ stageName: "Trivy" });
    for (const TRIVY_VIEW of trivyViews) {
      stage.addAction(new codepipeline_actions.CodeBuildAction({
        actionName: `Trivy_${TRIVY_VIEW}`,
        input: sourceOutput,
        project: trivyProject,
        environmentVariables: {TRIVY_VIEW: {value: TRIVY_VIEW}},
      }));
    }
  }
}

type Repository = {
  owner: string;
  name: string;
  branch: string;
};

class ContinousDeploymentPipelineStack extends cdk.Stack {
  constructor(
    scope: constructs.Construct,
    id: string,
    connection: codestarconnections.CfnConnection,
    env: string,
    repository: Repository,
    props?: cdk.StackProps,
  ) {
    super(scope, id, props);
    const capitalizedEnv = capitalize(env);
    const pipeline = new codepipeline.Pipeline(
      this,
      `Deploy${capitalizedEnv}Pipeline`,
      {
        pipelineName: `Deploy${capitalizedEnv}`,
        pipelineType: PipelineType.V1,
      },
    );
    cdk.Tags.of(pipeline).add("Repository", `${repository.owner}/${repository.name}`, { includeResourceTypes: ["AWS::CodePipeline::Pipeline"] });
    cdk.Tags.of(pipeline).add("FromBranch", repository.branch, { includeResourceTypes: ["AWS::CodePipeline::Pipeline"] });
    cdk.Tags.of(pipeline).add("ToBranch", `green-${env}`, { includeResourceTypes: ["AWS::CodePipeline::Pipeline"] });
    const sourceOutput = new codepipeline.Artifact();
    const sourceAction =
      new codepipeline_actions.CodeStarConnectionsSourceAction({
        actionName: "Source",
        connectionArn: connection.attrConnectionArn,
        codeBuildCloneOutput: true,
        owner: repository.owner,
        repo: repository.name,
        branch: repository.branch,
        output: sourceOutput,
        triggerOnPush: ["hahtuva", "dev", "qa", "prod"].includes(env),
      });
    const sourceStage = pipeline.addStage({ stageName: "Source" });
    sourceStage.addAction(sourceAction);
    const deployProject = new codebuild.PipelineProject(
      this,
      `Deploy${capitalizedEnv}Project`,
      {
        projectName: `Deploy${capitalizedEnv}`,
        concurrentBuildLimit: 1,
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: codebuild.ComputeType.SMALL,
          privileged: true,
        },
        environmentVariables: {
          CDK_DEPLOY_TARGET_ACCOUNT: {
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
            value: `/env/${env}/account_id`,
          },
          CDK_DEPLOY_TARGET_REGION: {
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
            value: `/env/${env}/region`,
          },
        },
        buildSpec: codebuild.BuildSpec.fromObject({
          version: "0.2",
          env: {
            "git-credential-helper": "yes",
          },
          phases: {
            build: {
              commands: [
                `./deploy-${env}.sh`,
                `./scripts/tag-green-build-${env}.sh`,
              ],
            },
          },
        }),
      },
    );

    const deploymentTargetAccount = ssm.StringParameter.valueFromLookup(
      this,
      `/env/${env}/account_id`,
    );
    const deploymentTargetRegion = ssm.StringParameter.valueFromLookup(
      this,
      `/env/${env}/region`,
    );

    deployProject.role?.attachInlinePolicy(
      new iam.Policy(this, `Deploy${capitalizedEnv}Policy`, {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: [
              `arn:aws:iam::${deploymentTargetAccount}:role/cdk-hnb659fds-lookup-role-${deploymentTargetAccount}-${deploymentTargetRegion}`,
              `arn:aws:iam::${deploymentTargetAccount}:role/cdk-hnb659fds-file-publishing-role-${deploymentTargetAccount}-${deploymentTargetRegion}`,
              `arn:aws:iam::${deploymentTargetAccount}:role/cdk-hnb659fds-image-publishing-role-${deploymentTargetAccount}-${deploymentTargetRegion}`,
              `arn:aws:iam::${deploymentTargetAccount}:role/cdk-hnb659fds-deploy-role-${deploymentTargetAccount}-${deploymentTargetRegion}`,
            ],
          }),
        ],
      }),
    );
    const deployAction = new codepipeline_actions.CodeBuildAction({
      actionName: "Deploy",
      input: sourceOutput,
      project: deployProject,
    });
    const deployStage = pipeline.addStage({ stageName: "Deploy" });
    deployStage.addAction(deployAction);
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function createBasicAuthFunctionCode(authorizationHashKey: string) {
  return `
import cf from "cloudfront";

var crypto = require("crypto");
var kvsHandle = cf.kvs();
var AUTHORIZATION_HASH_KEY = ${JSON.stringify(authorizationHashKey)};

async function handler(event) {
  var request = event.request;
  var authorization = request.headers.authorization && request.headers.authorization.value;

  if (!authorization) {
    return unauthorizedResponse();
  }

  var expectedHash;

  try {
    expectedHash = await kvsHandle.get(AUTHORIZATION_HASH_KEY, { format: "string" });
    expectedHash = expectedHash.trim().toLowerCase();
  } catch (error) {
    console.log("Failed to read basic auth hash from CloudFront KeyValueStore");
    return internalServerErrorResponse();
  }

  if (constantTimeEquals(sha256(authorization), expectedHash)) {
    return request;
  }

  return unauthorizedResponse();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function constantTimeEquals(actual, expected) {
  if (!actual || !expected || actual.length !== expected.length) {
    return false;
  }

  var mismatch = 0;
  for (var i = 0; i < actual.length; i++) {
    mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return mismatch === 0;
}

function unauthorizedResponse() {
  return {
    statusCode: 401,
    statusDescription: "Unauthorized",
    headers: {
      "cache-control": { value: "no-store" },
      "content-type": { value: "text/plain; charset=utf-8" },
      "www-authenticate": { value: "Basic realm=\\"Trivy reports\\", charset=\\"UTF-8\\"" },
    },
    body: "Unauthorized",
  };
}

function internalServerErrorResponse() {
  return {
    statusCode: 500,
    statusDescription: "Internal Server Error",
    headers: {
      "cache-control": { value: "no-store" },
      "content-type": { value: "text/plain; charset=utf-8" },
    },
    body: "Internal Server Error",
  };
}
`;
}

async function getAllowedIPs() {
  const ssmClient = new clientssm.SSMClient();
  const command = new clientssm.GetParameterCommand({
    Name: "/trivy/allowed-ips",
  });
  const response = await ssmClient.send(command);
  const ipGroups = JSON.parse(response.Parameter!.Value!) as Record<string, string[]>;
  return  Object.values(ipGroups).flat();
}

async function getAllowedIPV6s() {
  const ssmClient = new clientssm.SSMClient();
  const command = new clientssm.GetParameterCommand({
    Name: "/trivy/allowed-ipv6s",
  });
  const response = await ssmClient.send(command);
  const ipGroups = JSON.parse(response.Parameter!.Value!) as Record<string, string[]>;
  return  Object.values(ipGroups).flat();
}

Promise.all([getAllowedIPs(), getAllowedIPV6s()]).then(([ips, ipv6s]) => {
  const app = new CdkAppUtil({allowedIps: ips, allowedIpv6s: ipv6s});
  app.synth();
});
