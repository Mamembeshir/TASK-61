# HarborOps

Multi-tenant operations management platform for higher-education institutions — asset tracking, foodservice management (recipes, menus), meetings, and integrations (alerts, webhooks).

---

## How to Run

**One command starts the entire stack:**

```bash
docker compose up
```

That's it. On first boot the Django container will automatically:
1. Wait for MySQL to be healthy
2. Run all database migrations
3. Seed the allergen reference table
4. Seed Coastal University demo data (dev mode only)
5. Start the API server

> **Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose plugin). No other local dependencies required.

---

## Services

| Service | URL | Description |
|---------|-----|-------------|
| **React Frontend** | http://localhost:5173 | Main web UI (Vite dev server) |
| **Django API** | http://localhost:8000 | REST API + Django admin |
| **Django Admin** | http://localhost:8000/admin/ | Built-in admin interface |
| **API Health** | http://localhost:8000/api/v1/core/health/ | Liveness/readiness probe |
| **MySQL** | localhost:3306 | Database (harborops / harborops) |
| **Redis** | localhost:6379 | Task queue & cache |

---

## Verification

### 1. Check all containers are running

```bash
docker compose ps
```

All services should show `Up` or `healthy`:

```
NAME                  STATUS
repo-django-1         Up (healthy)
repo-frontend-1       Up
repo-mysql-1          Up (healthy)
repo-redis-1          Up (healthy)
repo-celery_worker-1  Up
repo-celery_beat-1    Up
```

### 2. Hit the health endpoint

```bash
curl http://localhost:8000/api/v1/core/health/
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-04-10T08:00:00+00:00",
  "database": "ok",
  "redis": "ok"
}
```

### 3. Open the frontend

Navigate to **http://localhost:5173** in your browser.

Log in with the demo admin account:

| Field    | Value            |
|----------|-----------------|
| Username | `admin.coastal` |
| Password | `Demo@pass1!`   |

### 4. Run the test suite

```bash
./run_tests.sh
```

Or backend only:

```bash
docker compose exec django pytest tests/ -q
```

---

## Environment Variables

All variables have sensible defaults for local development — no `.env` file needed to get started. To customise, copy `.env.example` to `.env`:

```bash
cp .env.example .env
# edit .env as needed
docker compose up
```

Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DJANGO_SECRET_KEY` | `dev-secret-key-…` | Django secret (change in production!) |
| `DJANGO_DEBUG` | `true` | Debug mode — also enables auto-seeding |
| `DB_PASSWORD` | `harborops` | MySQL password |
| `FIELD_ENCRYPTION_KEY` | *(dev key)* | AES-256 key for government ID field |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection URL |

---

## Development Commands

```bash
# View logs for a specific service
docker compose logs -f django

# Open a Django shell
docker compose exec django python manage.py shell

# Re-run migrations after model changes
docker compose exec django python manage.py migrate

# Re-seed demo data from scratch
docker compose exec django python manage.py seed_demo_data --flush

# Run backend tests with coverage
docker compose exec django pytest tests/ --cov=. --cov-report=term-missing

# Or use the Makefile
make test
make coverage
make seed-demo-flush
```

---

## Architecture

```
Frontend (React 18 + Vite)  :5173
        │
        │  HTTP / REST (Token auth)
        ▼
Backend (Django 4 + DRF)    :8000
        │
   ┌────┴────┐
   │         │
MySQL :3306  Redis :6379
             │
        Celery Worker + Beat
```

Full architecture documentation: `docs/design.md`  
API reference: `docs/api-spec.md`  
Business logic Q&A: `docs/questions.md`

---

## Project Structure

```
repo/
├── backend/              Django project
│   ├── core/             AuditLog, middleware, health check
│   ├── iam/              Users, auth, account status machine
│   ├── tenants/          Tenant, Site models
│   ├── assets/           Asset ledger + bulk import
│   ├── foodservice/      Recipes, dishes, menus
│   ├── meetings/         Meetings, tasks, resolutions
│   ├── integrations/     Alerts, webhooks
│   ├── analytics/        Analytics summaries
│   └── tests/            pytest test suite (515 tests)
├── frontend/             React 18 + TypeScript + Vite
├── docker/               Dockerfiles + MySQL init
├── docker-compose.yml    Full stack definition
├── run_tests.sh          One-command test runner
└── Makefile              Developer convenience commands
```
