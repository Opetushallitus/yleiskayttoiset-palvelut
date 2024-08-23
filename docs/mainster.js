const repos = {
  "Opetushallitus/cas": [],
  "Opetushallitus/cas-oppija": [],
  "Opetushallitus/henkilo-ui": ["SonarCloud Code Analysis"],
  "Opetushallitus/henkilotietomuutos": ["sonarcloud"],
  "Opetushallitus/java-utils": [],
  "Opetushallitus/kayttooikeus": [],
  "Opetushallitus/koodisto": [],
  "Opetushallitus/koodisto-app": [],
  "Opetushallitus/login-notifications": ["SonarCloud Code Analysis"],
  "Opetushallitus/oppijanumerorekisteri": ["SonarCloud Code Analysis"],
  "Opetushallitus/organisaatio": [],
  "Opetushallitus/osoitepalvelu": ["SonarCloud Code Analysis"],
  "Opetushallitus/palveluvayla": [],
  "Opetushallitus/rekisterointi": ["npm-audit"],
  "Opetushallitus/service-provider": [],
  "Opetushallitus/varda-rekisterointi": [],
  "Opetushallitus/vtj": [],
  "Opetushallitus/yleiskayttoiset-palvelut": [],
};

function updateTrunks(incubatorFilter) {
  return async () => {
    await Promise.all(Object.keys(repos).map(async (repoName, index) => {
      await fetchBranches(repoName).then((data) => {
        const branchMain = data.find((branch) => branch.name === "main");
        const branchMaster = data.find((branch) => branch.name === "master");
        const trunk = branchMain ?? branchMaster;

        return fetchCheckSuites(repoName, trunk.commit.sha).then((result) => {
          const trunkContainer = document.getElementById("trunkContainer");
          const existingCard = trunkContainer.querySelector(
            `[data-repo-name="${repoName}"]`,
          );
          const incubatorChecks = repos[repoName];

          if (existingCard) {
            updateCard(
              existingCard,
              repoName,
              trunk,
              result,
              incubatorChecks,
              incubatorFilter,
            );
          } else {
            updateCard(
              createCard(repoName, index),
              repoName,
              trunk,
              result,
              incubatorChecks,
              incubatorFilter,
            );
          }
        });
      });
    }))
  };
}

function updateCard(
  existingCard,
  repoName,
  trunk,
  checkSuites,
  incubatorChecks,
  incubatorFilter,
) {
  Promise.all(
    checkSuites
      .map((checkSuite) => checkSuite.id)
      .map((checkSuiteId) =>
        fetchCheckRunsForCheckSuite(repoName, checkSuiteId),
      ),
  ).then((checkRuns) => {
    const checks = latestRuns(checkRuns.flat())
      .filter(incubatorFilter(incubatorChecks))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((checkRun) => {
        const status =
          checkRun.status !== "completed"
            ? "in-progress"
            : ["success", "skipped"].includes(checkRun.conclusion)
              ? "blue"
              : "red";
        return {
          name: checkRun.name,
          color: status,
        };
      });
    checksHtml = checks
      .map((check) => `<div class="${check.color}">${check.name}</div>`)
      .join("");
    color = checks.some((check) => check.color === "red")
      ? "red"
      : checks.some((check) => check.color === "in-progress")
        ? "in-progress"
        : "blue";
    existingCard.className = `card ${color}`;
    existingCard.innerHTML = `<div>${repoName.split("/")[1]} (${trunk.name})</div>${checksHtml}`;
  });
}

function createCard(repoName, index) {
  const card = document.createElement("div");
  card.style.order = index;
  card.setAttribute("data-repo-name", repoName);
  card.className = `card`;
  const trunkContainer = document.getElementById("trunkContainer");
  trunkContainer.appendChild(card);
  return card;
}
