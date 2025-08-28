import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as cloudwatch from "@aws-sdk/client-cloudwatch";

// Load repositories from github.js
const {
  GITHUB_REPOS,
  fetchRepositoriesWithoutAuth,
}: {
  GITHUB_REPOS: string[],
  fetchRepositoriesWithoutAuth: (org: string) => Promise<ReadonlyArray<{
    full_name: string
    archived: boolean
  }>>;
} = require("./github.js");

const TRIVY_VIEW = process.argv[2]
const PUBLISH_METRICS = TRIVY_VIEW === "yleiskayttoiset"

type TrivyView = {
  viewName: string;
  title: string;
  repositories: string[];
}
const yleiskayttoisetRepositories = GITHUB_REPOS.map(repo => `github.com/${repo}`);

// Define the types for Trivy JSON report
interface Vulnerability {
    Severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

interface TrivyResult {
    Vulnerabilities?: Vulnerability[];
}

interface TrivyReport {
    Results?: TrivyResult[];
}

async function main() {
  const notArchived = await fetchRepositoriesWithoutAuth("Opetushallitus")
    .then(repos => repos.filter(repo => !repo.archived));
  const allRepositories = notArchived.map(repo => `github.com/${repo.full_name}`);

  const views: Array<TrivyView> = [
    {viewName: "yleiskayttoiset", title: "Yleiskäyttöiset Palvelut", repositories: yleiskayttoisetRepositories},
    {
      viewName: "ehoks",
      title: "eHOKS - ammatillisen koulutuksen henkilökohtaisen osaamisen suunnitelma",
      repositories: [
        "github.com/Opetushallitus/ehoks",
        "github.com/Opetushallitus/ehoks-ui",
        "github.com/Opetushallitus/heratepalvelu",
      ]
    },
    {
      viewName: "eperusteet",
      title: "ePerusteet - opetussuunnitelmien ja tutkintojen ja koulutusten perusteet",
      repositories: [
        "github.com/Opetushallitus/eperusteet-ai",
        "github.com/Opetushallitus/eperusteet-amosaa",
        "github.com/Opetushallitus/eperusteet-amosaa-ui",
        "github.com/Opetushallitus/eperusteet-backend-utils",
        "github.com/Opetushallitus/eperusteet-e2e-smoke-test",
        "github.com/Opetushallitus/eperusteet-frontend-utils",
        "github.com/Opetushallitus/eperusteet-opintopolku",
        "github.com/Opetushallitus/eperusteet-pdf",
        "github.com/Opetushallitus/eperusteet-ui",
        "github.com/Opetushallitus/eperusteet-vst-ui",
        "github.com/Opetushallitus/eperusteet-ylops",
        "github.com/Opetushallitus/eperusteet-ylops-ui",
        "github.com/Opetushallitus/eperusteet",
      ]
    },
    {
      viewName: "kios", title: "KIOS - kieliosaamisen palvelut", repositories: [
        "github.com/Opetushallitus/kieli-ja-kaantajatutkinnot",
        "github.com/Opetushallitus/vkt",
        "github.com/Opetushallitus/yki-frontend",
        "github.com/Opetushallitus/yki",
      ]
    },
    {
      viewName: "koski", title: "Koski - opintosuoritus- ja tutkintotietojen tietovaranto", repositories: [
        "github.com/Opetushallitus/koski",
        "github.com/Opetushallitus/koski-luovutuspalvelu",
        "github.com/Opetushallitus/koski-mydata",
      ]
    },
    {
      viewName: "kielitutkintorekisteri", title: "KOTO-kokonaisuus ja kielitutkintorekisterit", repositories: [
        "github.com/Opetushallitus/koto-rekisteri",
      ]
    },
    {
      viewName: "koulutustarjonnan_palvelut", title: "Koulutustarjonnan palvelut", repositories: [
        "github.com/Opetushallitus/konfo-files",
        "github.com/Opetushallitus/kto-ui-common",
        "github.com/Opetushallitus/tarjonta-api-dokumentaatio",
      ]
    },
    {
      viewName: "mpassid", title: "MPASSid - kirjautumisratkaisu koulutustoimijoille", repositories: [
        "github.com/Opetushallitus/MPASSid-hallintapalvelu",
      ]
    },
    {
      viewName: "opiskelijavalinnan_palvelut", title: "Opiskelijavalinnan palvelut", repositories: [
        "github.com/Opetushallitus/seuranta",
      ]
    },
    {
      viewName: "oppijan_henkilokohtaiset_palvelut", title: "Oppijan henkilökohtaiset palvelut", repositories: [
        "github.com/Opetushallitus/oma-opintopolku-loki",
      ]
    },
    {
      viewName: "tukipalvelut", title: "Tukipalvelut", repositories: [
        "github.com/Opetushallitus/virkailija-styles",
        "github.com/Opetushallitus/virkailija-ui-components",
      ]
    },
    {
      viewName: "varda", title: "Varhaiskasvatuksen tietovaranto Varda", repositories: [
        "github.com/Opetushallitus/varda",
      ]
    },
    {
      viewName: "opiskelijavalinnat", title: "Opiskelijavalintojen palvelut ja kirjastot", repositories: [
        "github.com/Opetushallitus/ataru",
        "github.com/Opetushallitus/dokumenttipalvelu",
        "github.com/Opetushallitus/elasticsearch-analysis-raudikko",
        "github.com/Opetushallitus/haku",
        "github.com/Opetushallitus/hakukohderyhmapalvelu",
        "github.com/Opetushallitus/hakurekisteri",
        "github.com/Opetushallitus/liiteri",
        "github.com/Opetushallitus/konfo-backend",
        "github.com/Opetushallitus/konfo-ui",
        "github.com/Opetushallitus/kouta-backend",
        "github.com/Opetushallitus/kouta-external",
        "github.com/Opetushallitus/kouta-indeksoija",
        "github.com/Opetushallitus/kouta-internal",
        "github.com/Opetushallitus/kouta-ui",
        "github.com/Opetushallitus/lokalisointi",
        "github.com/Opetushallitus/maksut",
        "github.com/Opetushallitus/ohjausparametrit",
        "github.com/Opetushallitus/omatsivut",
        "github.com/Opetushallitus/oma-opintopolku",
        "github.com/Opetushallitus/opiskelijavalinnat-local-setup",
        "github.com/Opetushallitus/opiskelijavalinnat-utils",
        "github.com/Opetushallitus/oppijan-tunnistus",
        "github.com/Opetushallitus/oppija-raamit",
        "github.com/Opetushallitus/oti",
        "github.com/Opetushallitus/ovara",
        "github.com/Opetushallitus/ovara-virkailija",
        "github.com/Opetushallitus/palaute",
        "github.com/Opetushallitus/scala-group-emailer",
        "github.com/Opetushallitus/scala-utils",
        "github.com/Opetushallitus/sijoittelu",
        "github.com/Opetushallitus/suorituspalvelu",
        "github.com/Opetushallitus/tarjonta",
        "github.com/Opetushallitus/tarjonta-pulssi",
        "github.com/Opetushallitus/ulkoiset-rajapinnat",
        "github.com/Opetushallitus/valintalaskenta",
        "github.com/Opetushallitus/valintalaskenta-ui",
        "github.com/Opetushallitus/valintalaskentakoostepalvelu",
        "github.com/Opetushallitus/valintaperusteet",
        "github.com/Opetushallitus/valintaperusteet-ui",
        "github.com/Opetushallitus/valintapiste-service",
        "github.com/Opetushallitus/valinta-sharedutils",
        "github.com/Opetushallitus/valinta-tulos-service",
        "github.com/Opetushallitus/valintojen-toteuttaminen",
        "github.com/Opetushallitus/viestintapalvelu",
        "github.com/Opetushallitus/virkailija-raamit",
        "github.com/Opetushallitus/virkailijan-tyopoyta",
      ]
    },
  ]
  const groupedRepositories = views.flatMap(view => view.repositories);
  const remainingRepositories = allRepositories.filter(repo => !groupedRepositories.includes(repo));
  views.push({ viewName: "muut", title: "Muut", repositories: remainingRepositories });
  views.push({ viewName: "kaikki", title: "Kaikki Opetushallituksen arkistoimattomat repositoryt", repositories: allRepositories });

  const view = views.find(view => view.viewName === TRIVY_VIEW)
  if (!view) throw new Error(`Invalid view ${TRIVY_VIEW}`)
  const actualRepositories = view.repositories.filter(repo => allRepositories.includes(repo));
  await generateReportPage(view.title, view.viewName, actualRepositories);
}

async function generateReportPage(title: string, viewName: string, repositories: string[]) {
  console.log(`Generating Trivy report for ${repositories.length} repositories: ${repositories}`);
  // Directory to store Trivy reports
  const reportDir = path.resolve("trivy_reports", viewName);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, {recursive: true});
  }

  // Docker Trivy image
  const trivyImage = "aquasec/trivy:latest";
  const trivyVersion = execSync(`docker run --rm ${trivyImage} --version`).toString().match(/Version:\s+(\S+)/)?.[1] || "Unknown";

  // Function to count vulnerabilities from a Trivy JSON report
  function countVulnerabilities(reportPath: string): { reportPath: string; low: number; medium: number; high: number; critical: number } {
    const reportData: TrivyReport = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    let low = 0;
    let medium = 0;
    let high = 0;
    let critical = 0;

    reportData.Results?.forEach((result: TrivyResult) => {
      result.Vulnerabilities?.forEach((vuln: Vulnerability) => {
        if (vuln.Severity === "LOW") low++;
        if (vuln.Severity === "MEDIUM") medium++;
        if (vuln.Severity === "HIGH") high++;
        if (vuln.Severity === "CRITICAL") critical++;
      });
    });

    return {reportPath, low, medium, high, critical};
  }

  type ScanResult
    = { repoName: string; error: false; reportPath: string; low: number; medium: number; high: number; critical: number }
    | { repoName: string; error: true; };
  // Run Trivy on each GitHub repository
  const findings: ScanResult[] = [];

  repositories.forEach((repo) => {
    const repoName = repo.split("/").slice(-2).join("_").replace(/\./g, "_"); // Convert "github.com/owner/repo" to "owner_repo"
    const outputFile = path.join(reportDir, `${repoName}_trivy.json`);

    console.log(`Running Trivy for ${repo}...`);

    try {
      // Run Trivy in Docker for GitHub repository with "--scanners vuln"
      execSync(
          `docker run --rm --volume trivy-cache:/trivy-cache --volume ${reportDir}:/reports ${trivyImage} repo ${repo} --cache-dir /trivy-cache --scanners vuln --format json --output /reports/${repoName}_trivy.json`
      );
      const counts = countVulnerabilities(outputFile);
      findings.push({repoName, error: false, ...counts});
    } catch (error) {
      console.error(`Error scanning ${repo}:`, error);
      if (viewName === "muut" || viewName === "kaikki") {
        console.log("Ignoring error because there are some strange repos that make Trivy fail")
        findings.push({repoName, error: true });
      } else {
        process.exit(1)
      }
    }
  });

  if (PUBLISH_METRICS) {
    function makeMetric(repo: string, severity: "Critical" | "High" | "Medium" | "Low", value: number): cloudwatch.MetricDatum {
      return {
        MetricName: "TrivyReportedVulnerabilities",
        Value: value,
        Dimensions: [
          { Name: "Repository", Value: repo },
          { Name: "Severity", Value: severity },
        ],
      };
    }

    const cloudwatchClient = new cloudwatch.CloudWatchClient({ region: "eu-west-1" });
    try {
      const metrics = findings.flatMap(finding => finding.error ? [] : [
        makeMetric(finding.repoName, "Critical", finding.critical),
        makeMetric(finding.repoName, "High", finding.high),
        makeMetric(finding.repoName, "Medium", finding.medium),
        makeMetric(finding.repoName, "Low", finding.low),
      ])
      console.log("Publishing metrics: ", JSON.stringify(metrics))
      cloudwatchClient.send(new cloudwatch.PutMetricDataCommand({
        Namespace: "Trivy",
        MetricData: metrics
      }))
    } catch (e) {
      console.error("Error publishing metrics", e)
    }
  }

  // Generate the current date
  const currentDate = new Date().toLocaleString('fi-FI', {
    timeZone: 'Europe/Helsinki',
    timeZoneName: 'short',
  });

  const errors = findings.filter((f) => f.error)

  // Generate HTML summary report
  const htmlTemplate = `
  <!DOCTYPE html>
  <html>
  <head>
      <title>Trivy GitHub Vulnerability Report - ${title}</title>
      <meta charset="utf-8">
      <meta http-equiv="refresh" content="120">
      <style>
          body { font-family: Arial, sans-serif; background-color: #000; color: #eee; }
          p { font-size: 0.9em; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: center; background-color: #000; }
          th { cursor: pointer; }
          .zero { background-color: blue; color: white; }
          .critical { background-color: red; color: white; }
          .high { background-color: orange; color: white; }
          .medium { background-color: yellow; color: black; }
          .low { background-color: cyan; color: black; }
          .errors { background-color: red; color: white; padding: 1rem; }
          a { color: white; }
      </style>
  </head>
  <body>
      <h1>Trivy GitHub Vulnerability Report - ${title}</h1>
      <p>Report generated on: ${currentDate}</p>
      <p>Trivy Version: ${trivyVersion}</p>
      ${errors.length
        ? `<div class="errors">
            <p>Failed to scan the following repositories:</p>
            <ul>
              ${errors.map((e) => `<li>${e.repoName}</li>`).join("\n")}
            </ul>
          </div>`
        : ''}
      <table>
              <tr>
                  <th>Repository</th>
                  <th>Kriittinen</th>
                  <th>Korkea</th>
                  <th>Keskitaso</th>
                  <th>Matala</th>
              </tr>
              ${findings
    .sort((a, b) => a.repoName.localeCompare(b.repoName))
    .map(
      (finding) => finding.error
          ? ''
          : `
              <tr>
                  <td><a href="${path.relative(__dirname, finding.reportPath)}">${finding.repoName}</a></td>
                  <td class="${finding.critical === 0 ? "zero" : "critical"}">${finding.critical}</td>
                  <td class="${finding.high === 0 ? "zero" : "high"}">${finding.high}</td>
                  <td class="${finding.medium === 0 ? "zero" : "medium"}">${finding.medium}</td>
                  <td class="${finding.low === 0 ? "zero" : "low"}">${finding.low}</td>
              </tr>
          `
    )
    .join("\n")}
      </table>
      <script type="text/javascript">
          const getCellValue = (tr, idx) => tr.children[idx].innerText || tr.children[idx].textContent;
          const comparer = (idx, asc) => (a, b) => ((v1, v2) =>
              v1 !== '' && v2 !== '' && !isNaN(v1) && !isNaN(v2) ? v1 - v2 : v1.toString().localeCompare(v2)
              )(getCellValue(asc ? a : b, idx), getCellValue(asc ? b : a, idx));
          document.querySelectorAll('th').forEach(th => th.addEventListener('click', (() => {
              const table = th.closest('table');
              Array.from(table.querySelectorAll('tr:nth-child(n+2)'))
                  .sort(comparer(Array.from(th.parentNode.children).indexOf(th), this.asc = !this.asc))
                  .forEach(tr => table.appendChild(tr) );
          })));
      </script>
  </body>
  </html>
  `;

  // Save the HTML report
  const reportPath = path.resolve(`${viewName}.html`);
  fs.writeFileSync(reportPath, htmlTemplate, {encoding: "utf-8"});

  console.log(`HTML report generated: ${reportPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});