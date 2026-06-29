#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

printf 'Basic %s' "$(printf '%s:%s' "$TRIVY_USER" "$TRIVY_PASSWORD" | openssl base64 -A)" | shasum -a 256 | awk '{print $1}'