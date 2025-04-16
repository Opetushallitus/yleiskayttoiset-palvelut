async function updatePipelines() {
    const state = await fetchRadiatorData()
    for (const account of state.accounts) {
        for (const service of account.services) {
            const header = findOrAppendById('h1', `header-${service.id}`, document.body)
            header.innerText = service.name
            header.style.color = 'white'

            const row = findOrAppendById('div', `row-${service.id}`, document.body)
            row.className = 'card-row'
            for (const pipeline of service.pipelines) {
                replaceOrAppendById(pipeline.id, row, createPipelineCard(pipeline))
            }
        }

        const alarmRow = findOrAppendById('div', `alarm-header-${account.id}`, document.body)
        alarmRow.className = 'card-row'
        for (const alarmGroup of account.alarmGroups) {
            replaceOrAppendById(alarmGroup.id, alarmRow, createAlarmCard(alarmGroup))
        }
    }
}

function createAlarmCard(alarmGroup) {
    let card = document.createElement('div');
    card.classList.add('card', 'alarm')

    const title = document.createElement('a');
    title.innerHTML = alarmGroup.title
    title.href = alarmGroup.cloudwatchUrl
    title.target = '_blank';
    card.appendChild(title)

    const alarmsWrapper = document.createElement('div');
    alarmsWrapper.classList.add("stages");
    for (const alarm of alarmGroup.alarms) {
        const alarmStateAsClass = alarm.StateValue === 'OK' ? 'Succeeded' : 'Failed'
        const wrapperCard = document.createElement('div');
        wrapperCard.className = 'stage ' + 'Succeeded'
        const alarmCard = document.createElement('div');
        alarmCard.innerHTML = alarm.AlarmName;
        alarmCard.className = 'action ' + alarmStateAsClass
        wrapperCard.appendChild(alarmCard)
        alarmsWrapper.appendChild(wrapperCard)
    }
    card.appendChild(alarmsWrapper)
    return card
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

function createPipelineCard(pipeline) {
    let card = document.createElement('div');
    card.className = 'card ' + pipeline.overallState

    const title = document.createElement('a');
    title.innerHTML = pipeline.name;
    title.href = pipeline.pipelineUrl;
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
    const pendingCommits = document.createElement('div');
    pendingCommits.innerHTML = `Pending commits: ${pipeline.pendingCommits}`;
    const fontSize = Math.min(4, Math.max(pipeline.pendingCommits / 2, 1));
    pendingCommits.style.fontSize = `${fontSize}em`;
    card.appendChild(pendingCommits)
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

const CODEPIPELINE_UPDATE_INTERVAL = 5000
async function repeatedly(func) {
    try {
        console.log("Updating...")
        const start = Date.now()
        await func()
        const timeElapsed = Date.now() - start
        console.log(`Update complete in ${timeElapsed} ms`)
    } finally {
        checkIfRadiatorFitsTheScreen()
        console.log(`Scheduling next update in ${CODEPIPELINE_UPDATE_INTERVAL} ms`)
        setTimeout(() => repeatedly(func), CODEPIPELINE_UPDATE_INTERVAL)
    }
}

function checkIfRadiatorFitsTheScreen() {
    document.getElementById("ei-mahdu-varoitus").classList.remove("overflow")

    const body = document.body
    const html = document.documentElement

    const bodyHeight = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight
    )
    const bodyWidth = Math.max(
        body.scrollWidth,
        body.offsetWidth,
        html.clientWidth,
        html.scrollWidth,
        html.offsetWidth
    )

    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth

    if (bodyHeight > viewportHeight || bodyWidth > viewportWidth) {
        document.getElementById("ei-mahdu-varoitus").classList.add("overflow")
    }
}

window.onload = () => repeatedly(updatePipelines)
window.onresize = () => checkIfRadiatorFitsTheScreen;
