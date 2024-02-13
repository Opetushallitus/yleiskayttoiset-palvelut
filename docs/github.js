function fetchCheckSuites(repoName, sha) {
  return fetch(
    `https://api.github.com/repos/${repoName}/commits/${sha}/check-suites`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        Accept: "application/vnd.github.antiope-preview+json",
      },
    }
  ).then((response) => response.json());
}
function fetchCheckRunsForCheckSuite(repoName, checkSuiteId) {
  const url = `https://api.github.com/repos/${repoName}/check-suites/${checkSuiteId}/check-runs`;

  return fetch(
    `https://api.github.com/repos/${repoName}/check-suites/${checkSuiteId}/check-runs`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        Accept: "application/vnd.github.antiope-preview+json",
      },
    }
  ).then((response) => response.json());
}
function fetchCheckRuns(repoName, sha) {
    return fetch(
        `https://api.github.com/repos/${repoName}/commits/${sha}/check-runs`,
        {
            headers: {
                Authorization: `token ${token}`,
                Accept: "application/vnd.github.v3+json",
                Accept: "application/vnd.github.antiope-preview+json",
            },
        }
    )
        .then((response) => response.json())
}
async function fetchBranches(repoName) {
    const PER_PAGE = 30

    function fetchPage(page) {
        console.log(`Fetching page ${page} of branches for repo ${repoName}`)
        return fetch(`https://api.github.com/repos/${repoName}/branches?per_page=${PER_PAGE}&page=${page}`, {
            headers: {
                Authorization: `token ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
        })
            .then((response) => response.json())
    }

    let branches = []
    for (let i = 1;; ++i) {
        const next = await fetchPage(i)
        branches = [...branches, ...next]
        if (next.length < PER_PAGE) break;
    }
    return branches
}
async function fetchPulls(repoName) {
  const PER_PAGE = 30

  function fetchPage(page) {
    console.log(`Fetching page ${page} of pulls for repo ${repoName}`)
    return fetch(`https://api.github.com/repos/${repoName}/pulls?per_page=${PER_PAGE}&page=${page}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    })
      .then((response) => response.json())
  }

  let pulls = [];
  for (let i = 1;; ++i) {
    const next = await fetchPage(i)
    pulls = [...pulls, ...next]
    if (next.length < PER_PAGE) break
  }
  return pulls
}

async function fetchActionRuns(repoName) {
  const PER_PAGE = 10

  function fetchPage(page) {
    console.log(`Fetching page ${page} of action runs for repo ${repoName}`)
    return fetch(`https://api.github.com/repos/${repoName}/actions/runs?per_page=${PER_PAGE}&page=${page}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    })
      .then((response) => response.json())
      .then(_ => _.workflow_runs)
  }

  let results = []
  for (let i = 1; i <= 1; ++i) { // Fetching only first page because there are a lot of runs!
    const next = await fetchPage(i)
    results = [...results, ...next]
    if (next.length < PER_PAGE) break
  }
  return results
}

