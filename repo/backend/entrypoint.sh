#!/bin/sh
# Wait for MySQL to accept connections before starting Django.
set -e

echo "Waiting for MySQL at ${DB_HOST}:${DB_PORT:-3306}…"
until python - <<'PYEOF'
import os, sys
try:
    import MySQLdb
    MySQLdb.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        passwd=os.environ["DB_PASSWORD"],
        db=os.environ["DB_NAME"],
    )
except Exception:
    sys.exit(1)
PYEOF
do
  printf '.'
  sleep 2
done

echo ""
echo "MySQL ready."

echo "Running migrations…"
python manage.py migrate --noinput

echo "Collecting static files…"
python manage.py collectstatic --noinput --clear

# Always seed the allergen reference table (idempotent — safe to re-run)
echo "Seeding allergen reference data…"
python manage.py seed_allergens

if [ "${DJANGO_DEBUG:-false}" = "true" ]; then
  echo "Seeding dev data…"
  python manage.py seed_dev_data
  echo "Seeding Coastal University demo data…"
  python manage.py seed_demo_data
fi

echo "Starting Django…"
exec "$@"
