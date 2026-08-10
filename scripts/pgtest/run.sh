#!/usr/bin/env bash
# ---------------------------------------------------------------------
# supabase/setup_all.sql をローカルのPostgreSQLに流し、
# RLS・RPC・トリガーが意図どおり動くかを確かめる。
#
#   ./scripts/pgtest/run.sh
#
# 使い捨てのデータベースを毎回作り直すので、既存の環境には触れない。
# Supabaseが用意しているもの（auth スキーマ・ロール・storage）は
# scripts/pgtest/stub_supabase.sql で同じ形に作る。
#
# 必要なもの: PostgreSQL 17（setup_all.sql の security_invoker はPG15以降）
# ---------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/../.."

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
PGPORT="${PGPORT:-55432}"
PGDATA_DIR="${PGDATA_DIR:-.pgtest/data}"
DB=tasuuketu_test

if [ ! -x "$PGBIN/postgres" ]; then
  echo "PostgreSQL 17 が $PGBIN に見つかりません。" >&2
  echo "brew install postgresql@17 を実行するか、PGBIN= で場所を指定してください。" >&2
  exit 1
fi

export PGHOST=127.0.0.1
export PGPORT

stop_server() {
  if [ -f "$PGDATA_DIR/postmaster.pid" ]; then
    "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  fi
}
trap stop_server EXIT

# 使い捨てのクラスタを作り直す
stop_server
rm -rf "$PGDATA_DIR"
mkdir -p "$PGDATA_DIR"
"$PGBIN/initdb" -D "$PGDATA_DIR" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$PGDATA_DIR" -o "-p $PGPORT -k /tmp" -w start >/dev/null

export PGUSER=postgres
"$PGBIN/createdb" "$DB"

run() { "$PGBIN/psql" -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1" >/dev/null; }

echo "▶ Supabase相当の土台を作る"
run scripts/pgtest/stub_supabase.sql

echo "▶ supabase/setup_all.sql を流す（1回目：新規セットアップ）"
run supabase/setup_all.sql

# setup_all.sql は「何度実行しても安全」と案内しているので、そこも確かめる。
# create or replace view は列を減らせないため、既存DBに流し直すと
# 「cannot drop columns from view」で落ちたことがある。
echo "▶ supabase/setup_all.sql をもう一度流す（2回目：既存DBへの流し直し）"
run supabase/setup_all.sql

echo "▶ テストを実行する"
"$PGBIN/psql" -q -v ON_ERROR_STOP=1 -d "$DB" -f scripts/pgtest/tests.sql
