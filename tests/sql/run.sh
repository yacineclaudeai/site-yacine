#!/usr/bin/env bash
# يخلق قاعدة بيانات فارغة، يطبق الـmigrations والـseed، ويشغل تيستات الصلاحيات.
# الاستعمال: tests/sql/run.sh   (يحتاج Postgres محلي و psql)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-site_yacine_test}
PSQL=(psql -v ON_ERROR_STOP=1 -q -X -t)
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f tests/sql/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -d "$DB" -f "$f"; done
"${PSQL[@]}" -d "$DB" -f supabase/seed.sql >/dev/null
for t in tests/sql/[1-9]*.sql; do "${PSQL[@]}" -d "$DB" -f "$t" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'; done
echo "كل تيستات الصلاحيات نجحو."
