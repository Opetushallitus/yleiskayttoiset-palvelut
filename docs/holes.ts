import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Load repositories from github.js
const { GITHUB_REPOS }: { GITHUB_REPOS: string[] } = require("./github.js");

// Prepend "github.com/" to each repository
const repositories = GITHUB_REPOS.map(repo => `github.com/${repo}`);

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

// Directory to store Trivy reports
const reportDir = path.resolve("trivy_reports");
if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
}

// Docker Trivy image
const trivyImage = "aquasec/trivy:latest";

// Function to count vulnerabilities from a Trivy JSON report
function countVulnerabilities(reportPath: string): { low: number; medium: number; high: number; critical: number } {
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

    return { low, medium, high, critical };
}

// Run Trivy on each GitHub repository
const findings: { repoName: string; low: number; medium: number; high: number; critical: number }[] = [];

repositories.forEach((repo) => {
    const repoName = repo.split("/").slice(-2).join("_").replace(/\./g, "_"); // Convert "github.com/owner/repo" to "owner_repo"
    const outputFile = path.join(reportDir, `${repoName}_trivy.json`);

    console.log(`Running Trivy for ${repo}...`);

    try {
        // Run Trivy in Docker for GitHub repository with "--scanners vuln"
        execSync(
            `docker run --rm -v ${reportDir}:/reports ${trivyImage} repo ${repo} --scanners vuln --format json --output /reports/${repoName}_trivy.json`
        );
        const counts = countVulnerabilities(outputFile);
        findings.push({ repoName, ...counts });
    } catch (error) {
        console.error(`Error scanning ${repo}:`, error);
        findings.push({ repoName, low: 0, medium: 0, high: 0, critical: 0 });
    }
});

// Generate the current date
const currentDate = new Date().toLocaleString();

// Generate HTML summary report
const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
    <title>Trivy GitHub Vulnerability Report - Yleiskäyttöiset Palvelut</title>
    <style>
        body { font-family: Arial, sans-serif; }
        h1 { color: #333; }
        p { font-size: 0.9em; color: #555; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
        th { background-color: #f4f4f4; }
        .zero { background-color: blue; color: white; }
        .non-zero { background-color: red; color: white; }
    </style>
</head>
<body>
    <h1>Trivy GitHub Vulnerability Report - Yleiskäyttöiset Palvelut</h1>
    <p>Report generated on: ${currentDate}</p>
    <table>
        <thead>
            <tr>
                <th>Repository</th>
                <th>Low Severity</th>
                <th>Medium Severity</th>
                <th>High Severity</th>
                <th>Critical Severity</th>
            </tr>
        </thead>
        <tbody>
            ${findings
                .map(
                    (finding) => `
                <tr>
                    <td>${finding.repoName}</td>
                    <td class="${finding.low === 0 ? "zero" : "non-zero"}">${finding.low}</td>
                    <td class="${finding.medium === 0 ? "zero" : "non-zero"}">${finding.medium}</td>
                    <td class="${finding.high === 0 ? "zero" : "non-zero"}">${finding.high}</td>
                    <td class="${finding.critical === 0 ? "zero" : "non-zero"}">${finding.critical}</td>
                </tr>
            `
                )
                .join("\n")}
        </tbody>
    </table>
</body>
</html>
`;

// Save the HTML report
const reportPath = path.resolve("trivy_report.html");
fs.writeFileSync(reportPath, htmlTemplate);

console.log(`HTML report generated: ${reportPath}`);