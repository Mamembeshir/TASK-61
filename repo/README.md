# HarborOps

A multi-tenant operations management platform for higher-education institutions — asset ledger and bulk import, foodservice management (recipes, dishes, menus with versioning), meetings with agenda/minutes/resolutions/tasks, and outbound integrations (alerts, webhooks).

## Architecture & Tech Stack

* **Frontend:** React 18, TypeScript, Vite, React Router 6, Axios, Recharts, Lucide icons
* **Backend:** Django 5, Django REST Framework, DRF Token auth with HMAC-signed request integrity
* **Database:** MySQL 8.0
* **Task Queue & Cache:** Redis 7, Celery worker + beat scheduler
* **Testing:** pytest (backend), Vitest + Testing Library (frontend unit), Playwright (E2E in Docker)
* **Containerization:** Docker & Docker Compose (Required)

## Project Structure

```text
.
├── backend/                    # Django project
│   ├── core/                   # AuditLog, middleware, health check
│   ├── iam/                    # Users, auth, account status machine
│   ├── tenants/                # Tenant + Site models
│   ├── assets/                 # Asset ledger + bulk import
│   ├── foodservice/            # Recipes, dishes, menus (versioned)
│   ├── meetings/               # Meetings, agenda, resolutions, tasks
│   ├── integrations/           # Alerts, webhooks
│   ├── analytics/              # Analytics summaries
│   ├── tests/                  # pytest suite (backend API + integration)
│   ├── Dockerfile              # (at docker/Dockerfile)
│   └── manage.py
├── frontend/                   # React + Vite app
│   ├── src/
│   ├── tests/unit/             # Vitest unit tests
│   ├── tests/e2e/              # Playwright E2E specs
│   └── playwright.config.ts
├── docker/                     # Dockerfiles (django, frontend, playwright), MySQL init, nginx E2E proxy
├── .env.example                # Example environment variables
├── docker-compose.yml          # Multi-container orchestration
├── run_tests.sh                # Standardized test execution script
├── Makefile                    # Developer convenience commands
└── README.md
```

## Prerequisites

To ensure a consistent environment, this project is designed to run entirely within containers. You must have the following installed:
* [Docker](https://docs.docker.com/get-docker/)
* [Docker Compose](https://docs.docker.com/compose/install/)

No other local dependencies (Python, Node, MySQL, Redis) are required.

## Running the Application

1. **(Optional) Copy the example environment file:**
   All variables have sensible defaults for local development, so this step is optional.
   ```bash
   cp .env.example .env
   ```

2. **Build and Start Containers:**
   Use Docker Compose to build the images and spin up the entire stack in detached mode.
   ```bash
   docker compose up --build -d
   ```
   On first boot the `django` container will automatically wait for MySQL to be healthy, run migrations, seed the allergen reference table, and seed Coastal University demo data (dev mode only).

3. **Access the App:**
   * Frontend: `http://localhost:5173`
   * Backend API: `http://localhost:8000/api/v1/`
   * Django Admin: `http://localhost:8000/admin/`
   * API Health Check: `http://localhost:8000/api/v1/core/health/`

4. **Stop the Application:**
   ```bash
   docker compose down -v
   ```

## Testing

All unit, integration, and E2E tests are executed via a single, standardized shell script. This script automatically handles the container orchestration required for each test tier.

Make sure the script is executable, then run it:

```bash
chmod +x run_tests.sh
./run_tests.sh
```

The script supports scoping flags:

```bash
./run_tests.sh --backend   # pytest backend only
./run_tests.sh --frontend  # vitest frontend unit tests only
./run_tests.sh --e2e       # Playwright E2E tests (fully Dockerized)
./run_tests.sh --coverage  # backend with coverage report (≥80% gate)
```

*Note: The `run_tests.sh` script outputs a standard exit code (`0` for success, non-zero for failure) to integrate smoothly with CI/CD validators.*

## Seeded Credentials

The database is pre-seeded with the following test users on startup (when `DJANGO_DEBUG=true`). All accounts share the same password: **`Demo@pass1!`**. Use these credentials to verify authentication and role-based access controls.

| Role | Username | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin.coastal` | `Demo@pass1!` | Full tenant access; Django staff. Lands on `/admin/users`. |
| **Staff** | `alice.staff` | `Demo@pass1!` | Assigned to Main Campus + North Campus. Lands on `/dashboard`. |
| **Staff** | `bob.staff` | `Demo@pass1!` | Assigned to South Campus. |
| **Courier** | `carlos.courier` | `Demo@pass1!` | Assigned to Main Campus. Lands on `/courier`. |
| **Courier** | `diana.courier` | `Demo@pass1!` | Assigned to North + South Campus. |

All five users belong to the **Coastal University** tenant and are seeded by the Django management command `python manage.py seed_demo_data`, which runs automatically on first boot in dev mode.
