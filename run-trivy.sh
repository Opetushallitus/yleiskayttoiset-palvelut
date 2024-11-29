#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "$0")" && pwd)"
source "${repo}/scripts/lib/common-functions.sh"
readonly node_version=$(cat "$repo/.nvmrc")

function main {
  cd "$repo/docs"
  require_docker
  init_nodejs
  npx ts-node holes.ts
}

main "$@"
