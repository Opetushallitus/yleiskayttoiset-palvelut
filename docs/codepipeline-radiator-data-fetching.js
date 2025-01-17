AWS.config.update({
    accessKeyId: localStorage.getItem("yleiskayttoiset-palvelut.key"),
    secretAccessKey: localStorage.getItem("yleiskayttoiset-palvelut.secret"),
    region: localStorage.getItem("yleiskayttoiset-palvelut.region")
});

async function fetchRadiatorData() {
    const yleiskayttoisetCredentials = AWS.config.credentials
    const palveluvaylaCredentials = new AWS.ChainableTemporaryCredentials({
        params: {RoleArn: 'arn:aws:iam::414665903273:role/RadiatorReader'}
    })
    const organisaatioCredentials = new AWS.ChainableTemporaryCredentials({
        params: {RoleArn: 'arn:aws:iam::135808915479:role/RadiatorReader'}
    })

    async function mkEnv(roleName, adminRole) {
        const credentials = new AWS.ChainableTemporaryCredentials({params: {RoleArn: roleName}})
        return {
            accountId: await getAccountId(new AWS.ChainableTemporaryCredentials({params: {RoleArn: roleName}})),
            adminRole,
            credentials,
        }
    }

    const yleiskayttoisetPalvelut = {
        accountName: 'yleiskayttoiset-palvelut',
        accountId: await getAccountId(yleiskayttoisetCredentials),
        adminRole: 'AdministratorAccess',
        codepipeline: new AWS.CodePipeline({credentials: yleiskayttoisetCredentials}),
        environments: {
            hahtuva: mkEnv('arn:aws:iam::471112979851:role/RadiatorReader', 'AdministratorAccess'),
            dev: mkEnv('arn:aws:iam::058264235340:role/RadiatorReader', 'AdministratorAccess'),
            qa: mkEnv('arn:aws:iam::730335317715:role/RadiatorReader', 'AdministratorAccess'),
            prod: mkEnv('arn:aws:iam::767397734142:role/RadiatorReader', 'AdministratorAccess'),
        }
    }
    const organisaatio = {
        accountName: 'Organisaatiopalvelu',
        accountId: await getAccountId(organisaatioCredentials),
        adminRole: 'AdministratorAccess',
        codepipeline: new AWS.CodePipeline({credentials: organisaatioCredentials}),
        environments: {
            hahtuva: mkEnv('arn:aws:iam::677276074218:role/RadiatorReader', 'AdministratorAccess'),
            dev: mkEnv('arn:aws:iam::536697232004:role/RadiatorReader', 'AdministratorAccess'),
            qa: mkEnv('arn:aws:iam::515966504732:role/RadiatorReader', 'AdministratorAccess'),
            prod: mkEnv('arn:aws:iam::448049787721:role/RadiatorReader', 'AdministratorAccess'),
        }
    }
    const palveluvayla = {
        accountName: 'Palveluväylä',
        accountId: await getAccountId(palveluvaylaCredentials),
        adminRole: 'PalveluvaylaAdmins',
        codepipeline: new AWS.CodePipeline({credentials: palveluvaylaCredentials}),
        environments: {
            dev: mkEnv('arn:aws:iam::734500016638:role/RadiatorReader', 'PalveluvaylaAdmins'),
            qa: mkEnv('arn:aws:iam::242002376717:role/RadiatorReader', 'PalveluvaylaAdmins'),
            prod: mkEnv('arn:aws:iam::483525580404:role/RadiatorReader', 'PalveluvaylaAdmins'),
        }
    }

    const accounts = [yleiskayttoisetPalvelut, organisaatio, palveluvayla]
    return { accounts: await Promise.all(accounts.map(fetchAccountState)) }
}

async function fetchAccountState(account) {
    const {accountName, accountId, codepipeline} = account
    console.log(`Fetching state for ${accountName} (${accountId})`)
    let services = []
    try {
        const data = await codepipeline.listPipelines({}).promise();
        const groups = group(accountName, toSorted((a, b) => {
            return sortableName(a.name).localeCompare(sortableName(b.name));
        }, data.pipelines))
        for (const [project, pipelines] of Object.entries(groups)) {
            let service = {
                id: `${accountId}-${project}`,
                name: project,
                alarmGroups: [],
                pipelines: [],
            }
            for (const pipeline of pipelines) {
                const state = await pipelineState(account, codepipeline, pipeline.name)
                service.pipelines.push(state)
            }
            services.push(service)
        }

        const alarmGroups = await Promise.all(Object.entries(account.environments).map(async ([envName, envAccountPromise]) => {
            console.log(`Fetching alarms for ${accountName} (${accountId}) env ${envName}`)
            const envAccount = await envAccountPromise
            const { credentials } = envAccount
            const alarmCardId = accountId + envName
            try {
                const allAlarms = [
                    // Special case for HealthCheck alarms that live on us-east-1 region
                    ...await fetchAlarms(new AWS.CloudWatch({credentials, region: 'us-east-1'})),
                    ...await fetchAlarms(new AWS.CloudWatch({credentials})),
                ]
                const withoutAutoScaling = allAlarms.filter(alarm => !isAutoScalingAlarm(alarm))
                const result = {
                    id: alarmCardId,
                    title: envName,
                    cloudwatchUrl: awsUrl(envAccount, cloudwatchAlarmsUrl()),
                    alarms: withoutAutoScaling,
                }
                console.log(`Fetching alarms for ${accountName} (${accountId}) env ${envName} complete`)
                return result
            } catch (err) {
                console.log(`Fetching alarms for ${accountName} (${accountId}) env ${envName} failed`)
                console.log(err, err.stack);
                return {
                    id: alarmCardId,
                    title: envName,
                    cloudwatchUrl: awsUrl(envAccount, cloudwatchAlarmsUrl()),
                    alarms: [{
                        AlarmName: `Error fetching alarms: ${err.message}`,
                        StateValue: 'ALARM'
                    }],
                }
            }
        }))

        console.log(`Fetching state for ${accountName} (${accountId}) complete`)
        return { id: accountId, services, alarmGroups }
    } catch (err) {
        console.log(err, err.stack);
        return [{ name: accountName + ` (${err.message})`, pipelines: [], alarmGroups: [] }]
    }
}

function isAutoScalingAlarm(alarm) {
    const alarmActions = alarm.AlarmActions ?? []
    return alarmActions.find(action => action.startsWith("arn:aws:autoscaling:"))
}

async function pipelineState(account, codepipeline, name) {
    const data = await codepipeline.getPipelineState({ name }).promise();
    const overallState = data.stageStates.map(function (stage) {
        return stage.latestExecution.status;
    }).reduce(function (a, b) {
        return a === 'Failed' || b === 'Failed' ? 'Failed' : a === 'InProgress' || b === 'InProgress' ? 'InProgress' : 'Succeeded';
    });
    const lastStage = data.stageStates[data.stageStates.length - 1]
    const lastDeploy = lastStage.actionStates[0].latestExecution.lastStatusChange
    const pipelineExecutionId = lastStage.latestExecution.pipelineExecutionId
    const execution = await codepipeline.getPipelineExecution({ pipelineName: name, pipelineExecutionId }).promise()
    const commit = execution.pipelineExecution.artifactRevisions.find(_ => _.name === "Artifact_Source_Source")?.revisionId

    return {
        id: account.accountId + data.pipelineName,
        name: data.pipelineName,
        pipelineUrl: awsUrl(account, pipelineUrl(data.pipelineName)),
        overallState,
        lastDeploy,
        commit,
        stages: data.stageStates.map(stage => {
            return {
                name: stage.stageName,
                status: stage.latestExecution.status,
                actions: stage.actionStates.map(action => {
                    return {
                        name: action.actionName,
                        status: action.latestExecution ? action.latestExecution.status : 'Unknown'
                    }
                })
            }
        }),
    }
}

async function fetchAlarms(cwClient) {
    async function exec(NextToken) {
        const response = await cwClient.describeAlarms({ NextToken }).promise()
        if (response.NextToken) {
            return [...alarms.MetricAlarms, await exec(response.NextToken)]
        } else {
            return response.MetricAlarms
        }
    }
    return await exec(undefined)
}

function pipelineUrl(pipelineName) {
    return `https://eu-west-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipelineName}/view?region=eu-west-1`
}

function cloudwatchAlarmsUrl() {
    return `https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1#alarmsV2:`
}

function awsUrl({accountId, adminRole}, destionationUrl) {
    return `https://oph-aws-sso.awsapps.com/start/#/console?account_id=${accountId}&role_name=${adminRole}&destination=${encodeURIComponent(destionationUrl)}`
}

async function getAccountId(credentials) {
    const sts = new AWS.STS({credentials});
    const data = await sts.getCallerIdentity({}).promise();
    return data.Account;
}

function group(account, pipelines) {
    const groupFn = pipeline => pipeline.name.startsWith("Kayttooikeus") ? "Otuva" : pipeline.name.split("Deploy")[0] || account
    return groupBy(pipelines, groupFn)
}

function sortableName(x) {
    return x.replace("Hahtuva", "1").replace("Dev", "2").replace("Qa", "3").replace("Prod", "4");
}
