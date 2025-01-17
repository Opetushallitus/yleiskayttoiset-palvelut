// Migrate local storage items to more descriptive names
function renameLocalStorageItem(from, to) {
    const value = localStorage.getItem(from)
    if (value) {
        localStorage.setItem(to, value)
        localStorage.removeItem(from)
    }
}
renameLocalStorageItem("key2", "yleiskayttoiset-palvelut.key")
renameLocalStorageItem("secret2", "yleiskayttoiset-palvelut.secret")
renameLocalStorageItem("region2", "yleiskayttoiset-palvelut.region")

let key  = localStorage.getItem("yleiskayttoiset-palvelut.key");
let secret = localStorage.getItem("yleiskayttoiset-palvelut.secret");
let region = localStorage.getItem("yleiskayttoiset-palvelut.region");

AWS.config.update({
    accessKeyId: key,
    secretAccessKey: secret,
    region: region
});

async function initAccounts() {
    const yleiskayttoisetCredentials = AWS.config.credentials
    const palveluvaylaCredentials = new AWS.ChainableTemporaryCredentials({
        params: {RoleArn: 'arn:aws:iam::414665903273:role/RadiatorReader'}
    })
    const organisaatioCredentials = new AWS.ChainableTemporaryCredentials({
        params: {RoleArn: 'arn:aws:iam::135808915479:role/RadiatorReader'}
    })
    async function mkEnv(roleName, adminRole) {
        const credentials = new AWS.ChainableTemporaryCredentials({ params: {RoleArn: roleName} })
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
    return [yleiskayttoisetPalvelut, organisaatio, palveluvayla]
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
async function pipelineState(codepipeline, name) {
    const data = await codepipeline.getPipelineState({ name }).promise();
    const overallState = data.stageStates.map(function (stage) {
        return stage.latestExecution.status;
    }).reduce(function (a, b) {
        return a === 'Failed' || b === 'Failed' ? 'Failed' : a === 'InProgress' || b === 'InProgress' ? 'InProgress' : 'Succeeded';
    });
    const actions  = data.stageStates.flatMap(_ => _.actionStates)
    const lastStage = data.stageStates[data.stageStates.length - 1]
    const lastDeploy = lastStage.actionStates[0].latestExecution.lastStatusChange
    const pipelineExecutionId = lastStage.latestExecution.pipelineExecutionId
    const execution = await codepipeline.getPipelineExecution({ pipelineName: name, pipelineExecutionId }).promise()
    const commit = execution.pipelineExecution.artifactRevisions.find(_ => _.name === "Artifact_Source_Source")?.revisionId

    return {
        name: data.pipelineName,
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
async function updatePipelines() {
    const accounts = await initAccounts()
    for (const account of accounts) {
        const {accountName, accountId, codepipeline} = account
        try {
            const data = await codepipeline.listPipelines({}).promise();
            const groups = group(accountName, toSorted((a, b) => {
                return sortableName(a.name).localeCompare(sortableName(b.name));
            }, data.pipelines))
            for (const [project, pipelines] of Object.entries(groups)) {
                const header = findOrAppendById('h1', `header-${accountId}-${project}`, document.body)
                header.innerText = project
                header.style.color = 'white'

                const row = findOrAppendById('div', `row-${accountId}-${project}`, document.body)
                row.className = 'card-row'

                for (const pipeline of pipelines) {
                    const state = await pipelineState(codepipeline, pipeline.name)
                    replaceOrAppendById(accountId + pipeline.name, row, createPipelineCard(account, state))
                }
            }

            function createAlarmCard(account, envName, alarms) {
                let card = document.createElement('div');
                card.classList.add('card', 'alarm')

                const title = document.createElement('a');
                title.innerHTML = envName
                title.href = awsUrl(account, cloudwatchUrl());
                title.target = '_blank';
                card.appendChild(title)

                const alarmsWrapper = document.createElement('div');
                alarmsWrapper.classList.add("stages");
                for (const alarm of alarms) {
                    const alarmStateAsClass = alarm.StateValue === 'OK' ? 'Succeeded' : 'Failed'
                    const alarmCard = document.createElement('div');
                    alarmCard.className = 'stage ' + 'Succeeded'
                    for (const action of [1]) {
                        const actionCard = document.createElement('div');
                        actionCard.innerHTML = alarm.AlarmName;
                        actionCard.className = 'action ' + alarmStateAsClass
                        alarmCard.appendChild(actionCard)
                    }
                    alarmsWrapper.appendChild(alarmCard)
                }
                card.appendChild(alarmsWrapper)
                return card

            }
            const alarmRow = findOrAppendById('div', `alarm-header-${accountId}`, document.body)
            alarmRow.className = 'card-row'
            for (const [envName, envAccountPromise] of Object.entries(account.environments)) {
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
                    replaceOrAppendById(alarmCardId, alarmRow, createAlarmCard(envAccount, envName, withoutAutoScaling))
                } catch (err) {
                    console.log(err, err.stack);
                    replaceOrAppendById(alarmCardId, alarmRow, createAlarmCard(envAccount, envName, [{
                        AlarmName: `Error fetching alarms: ${err.message}`,
                        StateValue: 'ALARM'
                    }]))
                }
            }
        } catch (err) {
            console.log(err, err.stack);
        }
    }
}

function replaceOrAppendById(id, parent, element) {
    element.id = id
    let existing = document.getElementById(id)
    if (!existing) {
        parent.appendChild(element)
    } else {
        existing.replaceWith(element)
    }
    return element
}

function findOrAppendById(type, id, parent) {
    let element = document.getElementById(id)
    if (!element) {
        element = document.createElement(type)
        element.id = id
        parent.appendChild(element)
    }
    return element
}

function isAutoScalingAlarm(alarm) {
    const alarmActions = alarm.AlarmActions ?? []
    return alarmActions.find(action => action.startsWith("arn:aws:autoscaling:"))
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

function cloudwatchUrl() {
    return `https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1#alarmsV2:`
}

function awsUrl({accountId, adminRole}, destionationUrl) {
    return `https://oph-aws-sso.awsapps.com/start/#/console?account_id=${accountId}&role_name=${adminRole}&destination=${encodeURIComponent(destionationUrl)}`
}

function createPipelineCard(account, pipeline) {
    let card = document.createElement('div');
    card.className = 'card ' + pipeline.overallState

    const title = document.createElement('a');
    title.innerHTML = pipeline.name;
    title.href = awsUrl(account, pipelineUrl(pipeline.name));
    title.target = '_blank';
    card.appendChild(title)

    const stages = document.createElement('div');
    stages.classList.add("stages");
    for (const stage of pipeline.stages) {
        const stageCard = document.createElement('div');
        stageCard.className = 'stage ' + stage.status
        for (const action of stage.actions) {
            const actionCard = document.createElement('div');
            actionCard.innerHTML = action.name;
            actionCard.className = 'action ' + action.status
            stageCard.appendChild(actionCard)
        }
        stages.appendChild(stageCard)
    }
    card.appendChild(stages)
    const lastDeploy = document.createElement('div');
    lastDeploy.innerText = formatTime(pipeline.lastDeploy)
    card.appendChild(lastDeploy)

    const commit = document.createElement('div');
    commit.innerText = pipeline.commit
    commit.style.color = "#" + pipeline.commit.substr(0, 6)
    card.appendChild(commit)
    return card
}

const dateFormat = new Intl.DateTimeFormat('fi-FI', {
    timeZone: 'Europe/Helsinki',
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
})

function formatTime(date) {
    if (!date) {
        return "Unknown"
    }
    return dateFormat.format(date)
}


const UPDATE_INTERVAL = 5000
async function repeatedly(func) {
    try {
        console.log("Updating...")
        await func()
    } finally {
        console.log(`Scheduling next update in ${UPDATE_INTERVAL} ms`)
        setTimeout(() => repeatedly(func), UPDATE_INTERVAL)
    }
}
window.onload = () => repeatedly(updatePipelines)
