.PHONY: setup migrate seed run-backend run-frontend test \
        build-frontend shell celery logs up down

DC      := docker-compose
DJANGO  := $(DC) exec django
PYTEST  := $(DC) exec django pytest

# ---------------------------------------------------------------------------
# up — build images and start all services
# ---------------------------------------------------------------------------
up:
	$(DC) up --build -d
	@echo "✓ Services started."
	@echo "  Django  → http://localhost:8000"
	@echo "  React   → http://localhost:5173"

# ---------------------------------------------------------------------------
# down — stop all services
# ---------------------------------------------------------------------------
down:
	$(DC) down

# ---------------------------------------------------------------------------
# setup — build images, run migrations, collect static
# ---------------------------------------------------------------------------
setup:
	@echo "→ Building images…"
	$(DC) build
	@echo "→ Starting dependencies (mysql, redis)…"
	$(DC) up -d mysql redis
	@echo "→ Waiting for MySQL to be ready…"
	$(DC) run --rm django sh -c "until python -c \"import MySQLdb; MySQLdb.connect(host='mysql',user='harborops',passwd='harborops',db='harborops')\" 2>/dev/null; do echo 'waiting for mysql...'; sleep 2; done"
	@echo "→ Running migrations…"
	$(DC) run --rm django python manage.py migrate --noinput
	@echo "→ Collecting static files…"
	$(DC) run --rm django python manage.py collectstatic --noinput
	@echo ""
	@echo "✓ Setup complete. Run 'make up' to start all services."

# ---------------------------------------------------------------------------
# migrate — run Django migrations inside the django container
# ---------------------------------------------------------------------------
migrate:
	$(DC) run --rm django python manage.py migrate --noinput

# ---------------------------------------------------------------------------
# seed — load fixture data
# ---------------------------------------------------------------------------
seed:
	$(DC) run --rm django python manage.py loaddata core/fixtures/seed.json \
		|| echo "No seed fixture found — skipping."

# ---------------------------------------------------------------------------
# run-frontend — start only the frontend service (and its logs)
# ---------------------------------------------------------------------------
run-frontend:
	$(DC) up frontend

# ---------------------------------------------------------------------------
# run-backend — start only the backend services
# ---------------------------------------------------------------------------
run-backend:
	$(DC) up django mysql redis

# ---------------------------------------------------------------------------
# test — run pytest inside the django container
# ---------------------------------------------------------------------------
test:
	$(DC) run --rm django pytest --cov=. --cov-report=term-missing -v

# ---------------------------------------------------------------------------
# build-frontend — production build inside the frontend container
# ---------------------------------------------------------------------------
build-frontend:
	$(DC) run --rm frontend npm run build

# ---------------------------------------------------------------------------
# shell — Django interactive shell inside container
# ---------------------------------------------------------------------------
shell:
	$(DJANGO) python manage.py shell

# ---------------------------------------------------------------------------
# logs — tail logs for all services (or pass service=django etc.)
# ---------------------------------------------------------------------------
logs:
	$(DC) logs -f $(service)

# ---------------------------------------------------------------------------
# celery — attach to the running celery_worker logs
# ---------------------------------------------------------------------------
celery:
	$(DC) logs -f celery_worker
