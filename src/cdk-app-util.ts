import * as codestarconnections from "aws-cdk-lib/aws-codestarconnections";
import * as cdk from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import {PipelineType} from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as constructs from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ssm from "aws-cdk-lib/aws-ssm";
import {DnsStack} from "./dns";

class CdkAppUtil extends cdk.App {
  constructor(props: cdk.AppProps) {
    super(props);

    const env = {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    };
    const {hostedZone} = new DnsStack(this, "DnsStack", { env });
    new ContinousDeploymentStack(this, "ContinuousDeploymentStack", {
      env,
      hostedZone,
    });
  }
}

type ContinousDeploymentStackProps = cdk.StackProps & {
  hostedZone: route53.IHostedZone,
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
