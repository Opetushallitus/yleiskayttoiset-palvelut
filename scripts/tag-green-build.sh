#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "$0")/.." && pwd)"
source "${repo}/scripts/lib/common-functions.sh"

function main {
  local -r env=$(parse_env_from_script_name)
  git tag --force "green-${env}"
  git tag "green-${env}-$(date +%s)"
  git push --tags --force origin
}

main "$@"
