#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "$0")" && pwd)"
source "${repo}/scripts/lib/common-functions.sh"
readonly node_version=$(cat "$repo/.nvmrc")

function main {
  cd "$repo"
  npm_ci_if_package_lock_has_changed
  cd "$repo/docs"
  require_docker
  init_nodejs
  npx ts-node holes.ts
  aws s3 cp ./trivy_report.html s3://oph-yleiskayttoiset-trivy-results/trivy_report.html
}

main "$@"
