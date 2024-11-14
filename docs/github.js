const UPDATE_INTERVAL = 10 * 1000

const GITHUB_REPO_INCUBATOR_CHECKS = {
    "Opetushallitus/henkilo-ui": ["SonarCloud Code Analysis"],
    "Opetushallitus/java-utils": [],
    "Opetushallitus/koodisto": [],
    "Opetushallitus/koodisto-app": [],
    "Opetushallitus/oppijanumerorekisteri": ["SonarCloud Code Analysis"],
    "Opetushallitus/organisaatio": [],
    "Opetushallitus/palveluvayla": [],
    "Opetushallitus/varda-rekisterointi": [],
    "Opetushallitus/rekisterointi": [],
    "Opetushallitus/vtj": [],
    "Opetushallitus/yleiskayttoiset-palvelut": [],
    "Opetushallitus/otuva": [],
};
const GITHUB_REPOS = Object.keys(GITHUB_REPO_INCUBATOR_CHECKS)

async function repeatedly(func) {
    try {
        console.log("Updating...")
        await func()
    } finally {
        console.log(`Scheduling next update in ${UPDATE_INTERVAL} ms`)
        setTimeout(() => repeatedly(func), UPDATE_INTERVAL)
    }
}

async function fetchCheckSuites(repoName, sha) {
    const PER_PAGE = 30
    function fetchPage(page) {
        return fetch(
            `https://api.github.com/repos/${repoName}/commits/${sha}/check-suites?per_page=${PER_PAGE}&page=${page}`,
            {
                headers: {
                    Authorization: `token ${token}`,
                    Accept: "application/vnd.github.v3+json",
                    Accept: "application/vnd.github.antiope-preview+json",
                },
            }
        ).then((response) => response.json());
    }

    let checkSuites = []
    for (let i = 1;; ++i) {
        const next = await fetchPage(i)
        checkSuites = [...checkSuites, ...next.check_suites]
        if (next.check_suites.length < PER_PAGE) break
    }
    return checkSuites
}
async function fetchCheckRunsForCheckSuite(repoName, checkSuiteId) {
  const PER_PAGE = 30

  function fetchPage(page) {
      return fetch(
          `https://api.github.com/repos/${repoName}/check-suites/${checkSuiteId}/check-runs?per_page=${PER_PAGE}&page=${page}`,
          {
              headers: {
                  Authorization: `token ${token}`,
                  Accept: "application/vnd.github.v3+json",
                  Accept: "application/vnd.github.antiope-preview+json",
              },
          }
      ).then((response) => response.json());
  }

  let checkRuns = []
  for (let i = 1;; ++i) {
      const next = await fetchPage(i)
      checkRuns = [...checkRuns, ...next.check_runs]
      if (next.check_runs.length < PER_PAGE) break;
  }
  return checkRuns
}

async function fetchCheckRuns(repoName, sha) {
    const PER_PAGE = 30

    function fetchPage(page) {
        return fetch(
            `https://api.github.com/repos/${repoName}/commits/${sha}/check-runs?per_page=${PER_PAGE}&page=${page}`,
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

    let checkRuns = []
    for (let i = 1;; ++i) {
        const next = await fetchPage(i)
        checkRuns = [...checkRuns, ...next.check_runs]
        if (next.check_runs.length < PER_PAGE) break;
    }
    return checkRuns
}

function latestRuns(checkRuns) {
    const checkMap = new Map();
    checkRuns.forEach((checkRun) => {
        const existing = checkMap.get(checkRun.name);
        if (!existing || existing.id < checkRun.id) {
            checkMap.set(checkRun.name, checkRun);
        }
    });
    return Array.from(checkMap.values());
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

