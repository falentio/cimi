#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="apps/api/src"

echo "=== 1. cross-resource repository imports in production code (not testing/) ==="
grep -rnE "from ['\"]\.\./+[a-z-]+/repository(\.drizzle)?\.ts['\"]" "$ROOT" \
  | grep -v "/testing/" || echo "(none)"

echo
echo "=== 2. cross-resource repository imports anywhere, incl. testing ==="
grep -rnE "from ['\"]\.\./+[a-z-]+/repository(\.drizzle)?\.ts['\"]" "$ROOT" \
  | awk -F: '{print $1}' | sed "s|$ROOT/resources/||; s|/.*||" | sort | uniq -c | sort -rn

echo
echo "=== 3. membership -> organization repository import ==="
grep -rn "organization/repository" "$ROOT/resources/membership" || echo "(none)"

echo
echo "=== 4. policy repository tests instantiating InstallationRepositoryDrizzle ==="
grep -rn "InstallationRepositoryDrizzle" "$ROOT/resources" | grep -v "installation/" || echo "(none)"

echo
echo "=== 5. who consumes site/scope.ts ==="
grep -rln "site/scope" "$ROOT" | sed "s|$ROOT/||" | sort

echo
echo "=== 6. repositories touching multiple resource tables ==="
for f in organization/repository.drizzle.ts collection-policy/repository.drizzle.ts retention-policy/repository.drizzle.ts; do
  echo "--- $f"
  grep -oE "schema\.[a-zA-Z]+" "$ROOT/resources/$f" | sort -u | tr '\n' ' '
  echo
done
