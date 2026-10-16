#!/bin/sh
# Executado pelo Postgres apenas na primeira inicialização (volume vazio).
# Aplica as migrations e depois os seeds, em ordem alfabética.
set -e

for dir in /sql/migrations /sql/seeds; do
  for file in "$dir"/*.sql; do
    [ -e "$file" ] || continue
    echo "init.sh: aplicando $file"
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$file"
  done
done
