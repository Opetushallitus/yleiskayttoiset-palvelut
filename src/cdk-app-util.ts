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
import * as s3 from "aws-cdk-lib/aws-s3";
import {BucketAccessControl} from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import {DnsStack} from "./dns";

class CdkAppUtil extends cdk.App {
  constructor(props: cdk.AppProps) {
    super(props);

    const env = {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    };
    new DnsStack(this, "DnsStack", { env });
    new ContinousDeploymentStack(this, "ContinuousDeploymentStack", {
      env,
    });
  }
}

class ContinousDeploymentStack extends cdk.Stack {
  constructor(scope: constructs.Construct, id: string, props?: cdk.StackProps) {
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


    new TrivyRunnerStack(this, "TrivyRunnerStack", connection, props);

    ["hahtuva", "dev", "qa", "prod"].forEach(
      (env) =>
        new ContinousDeploymentPipelineStack(
          this,
          `${capitalize(env)}ContinuousDeploymentPipeline`,
          connection,
          env,
          props,
        ),
    );
  }
}

class TrivyRunnerStack extends cdk.Stack {
  constructor(
    scope: constructs.Construct,
    id: string,
    connection: codestarconnections.CfnConnection,
    props?: cdk.StackProps,
  ) {
    super(scope, id, props);
    const bucket = new s3.Bucket(this, "TrivyResultBucket", {
      bucketName: "oph-yleiskayttoiset-trivy-results",
      accessControl: BucketAccessControl.PRIVATE,
    })
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, "OriginAccessIdentity")
    bucket.grantRead(originAccessIdentity)
    new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "trivy_report.html",
      defaultBehavior: {
        origin: new cloudfront_origins.S3Origin(bucket, { originAccessIdentity }),
        cachePolicy: new cloudfront.CachePolicy(this, "CachePolicy", {
          defaultTtl: cdk.Duration.seconds(0),
          minTtl: cdk.Duration.seconds(0),
          maxTtl: cdk.Duration.seconds(0),
        }),
      }
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
      schedule: events.Schedule.cron({ minute: "0" }),
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
    const trivyProject = new codebuild.PipelineProject(
      this,
      `TrivyProject`,
      {
        projectName: `RunTrivy`,
        concurrentBuildLimit: 1,
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

    const trivyAction = new codepipeline_actions.CodeBuildAction({
      actionName: "Trivy",
      input: sourceOutput,
      project: trivyProject,
    });
    const stage = pipeline.addStage({ stageName: "Trivy" });
    stage.addAction(trivyAction);
  }
}

class ContinousDeploymentPipelineStack extends cdk.Stack {
  constructor(
    scope: constructs.Construct,
    id: string,
    connection: codestarconnections.CfnConnection,
    env: string,
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
    let tag;
    switch (env) {
      case "hahtuva":
        tag = "main";
        break;
      case "dev":
        tag = "green-hahtuva";
        break;
      case "qa":
        tag = "green-dev";
        break;
      case "prod":
        tag = "green-qa";
        break;
    }
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
        triggerOnPush: env == "hahtuva",
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
            pre_build: {
              commands: [`git checkout ${tag}`],
            },
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

const app = new CdkAppUtil({});
app.synth();
