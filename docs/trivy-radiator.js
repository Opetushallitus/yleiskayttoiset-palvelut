AWS.config.update({
    accessKeyId: localStorage.getItem("yleiskayttoiset-palvelut.key"),
    secretAccessKey: localStorage.getItem("yleiskayttoiset-palvelut.secret"),
    region: localStorage.getItem("yleiskayttoiset-palvelut.region")
});

const cw = new AWS.CloudWatch({})

async function main() {
    document.body.classList.add("trivy-radiator")
    await makeGraph("Critical")
    await makeGraph("High")
    await makeGraph("Medium")
    await makeGraph("Low")
}
async function makeGraph(sev) {
    const cmd = {
        MetricWidget: JSON.stringify({
            title: "Trivy reported " + sev + " vulnerabilities",
            view: "timeSeries",
            stacked: true,
            metrics: GITHUB_REPOS.flatMap(repo => {
                const dim = repo.split("/").join("_").replace(/\./g, "_"); // Convert "owner/repo" to "owner_repo"
                return [sev].map(sev => ["Trivy", "TrivyReportedVulnerabilities", "Repository", dim, "Severity", sev])
            }),
            width: 1440/2,
            height: 2560/5,
            start: "-P1D",
            end: "P0D",
            yAxis: { left: { min: 0.0, max: 300.0 }}
        })
    }
    const data = await cw.getMetricWidgetImage(cmd).promise()
    const img = document.createElement("img")
    img.src = "data:image/png;base64," + await bufToBase64(data.MetricWidgetImage)

    const graph = document.createElement("div")
    graph.classList.add("trivy-graph")
    graph.appendChild(img)
    document.body.appendChild(graph)
}

async function bufToBase64(buffer) {
    const base64url = await new Promise(r => {
        const reader = new FileReader()
        reader.onload = () => r(reader.result)
        reader.readAsDataURL(new Blob([buffer]))
    });
    // remove the `data:...;base64,` part from the start
    return base64url.slice(base64url.indexOf(',') + 1);
}

window.onload = () => main().catch(err => console.error(err))