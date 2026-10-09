#!/usr/bin/env bash
# Audits resource repository boundaries. The walker test in
# apps/api/src/testing/resourceRepositoryBoundary.test.ts is the enforcement;
# this script reports the surrounding shape so a reviewer can judge the ruling.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="apps/api/src"

echo "=== 1. cross-resource repository imports in production code ==="
grep -rnE "from ['\"][^'\"]*/[a-z-]+/repository(\.drizzle)?\.ts['\"]" "$ROOT" \
  | grep -v '/testing/' | grep -v '\.test\.ts' | grep -vE "from ['\"]\./repository" \
  || echo "(none)"

echo
echo "=== 2. cross-resource repository imports, tests included ==="
grep -rnE "from ['\"][^'\"]*/[a-z-]+/repository(\.drizzle)?\.ts['\"]" "$ROOT" \
  | grep -vE "from ['\"]\./repository" \
  | awk -F: '{print $1}' | sed "s|$ROOT/resources/||; s|/.*||" | sort | uniq -c | sort -rn

echo
echo "=== 3. site/scope consumers (documented as a shared scope adapter) ==="
grep -rln "site/scope" "$ROOT" | sed "s|$ROOT/resources/||" | sort

echo
echo "=== 4. repositories that read tables another resource owns ==="
for resource in organization collection-policy retention-policy; do
  echo "--- $resource/repository.drizzle.ts"
  grep -oE "schema\.T[A-Za-z]+" "$ROOT/resources/$resource/repository.drizzle.ts" | sort -u | tr '\n' ' '
  echo
done

echo
echo "=== 5. guard ports that cross a resource boundary ==="
grep -nE '^export interface (Site|Ingestion)[A-Za-z]*Port' packages/guard/src/site.ts
