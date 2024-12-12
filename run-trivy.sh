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
  login_to_docker_if_possible
  npx ts-node holes.ts "${TRIVY_VIEW}"
  aws s3 cp ./${TRIVY_VIEW}.html s3://oph-yleiskayttoiset-trivy-results/${TRIVY_VIEW}.html
}

main "$@"
