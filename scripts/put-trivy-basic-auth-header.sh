#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

readonly aws_profile="${AWS_PROFILE:-oph-yleiskayttoiset-util}"
readonly key="authorization-sha256"
readonly key_value_store_name="trivy-basic-auth"

if [ -z "${TRIVY_BASIC_AUTH_HASH:-}" ]; then
  echo "Usage: set TRIVY_USER and TRIVY_PASSWORD, then run TRIVY_BASIC_AUTH_HASH=\$(scripts/create-trivy-basic-auth-header.sh) $0" >&2
  exit 1
fi

KVS_ARN=$(aws cloudfront list-key-value-stores \
  --query "KeyValueStoreList.Items[?Name=='${key_value_store_name}'].ARN | [0]" \
  --output text \
  --profile "${aws_profile}")

if [ -z "${KVS_ARN}" ] || [ "${KVS_ARN}" = "None" ]; then
  echo "CloudFront KeyValueStore '${key_value_store_name}' was not found" >&2
  exit 1
fi

ETAG=$(aws cloudfront-keyvaluestore describe-key-value-store \
  --kvs-arn "$KVS_ARN" \
  --query ETag \
  --output text \
  --profile "${aws_profile}")

aws cloudfront-keyvaluestore put-key \
  --kvs-arn "$KVS_ARN" \
  --key "${key}" \
  --value "$TRIVY_BASIC_AUTH_HASH" \
  --if-match "$ETAG" \
  --profile "${aws_profile}"
