# HarborOps — Architecture & Design Reference

---

## 1. System Overview

HarborOps is a multi-tenant operations management platform for higher-education institutions. It manages asset tracking, foodservice (recipes, menus), meetings, and integrations (alerts, webhooks).

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React 18)                     │
│  Vite + TypeScript + React Router v6 + inline CSS design tokens │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ HTTP  REST  (Token auth)
┌─────────────────────────────────▼───────────────────────────────┐
│                   Backend (Django 4 + DRF)                      │
│  8 Django apps │ multi-tenant scoping │ state machines          │
│  Celery workers │ Redis queue │ AES-256-GCM field encryption    │
└──────┬───────────────────────────────────────────┬──────────────┘
       │                                           │
┌──────▼──────┐                           ┌────────▼───────┐
│ PostgreSQL  │                           │    Redis        │
│ (primary DB)│                           │ (queue + cache) │
└─────────────┘                           └────────────────┘
```

---

## 2. Multi-Tenancy

Every resource in the system is scoped to a `Tenant`. A `User` belongs to exactly one `Tenant` via a FK constraint. Superusers (Django admin staff) have `tenant=NULL` and bypass tenant scoping.

**Key rules:**
- API views filter all querysets by `request.user.tenant_id`.
- `TenantMiddleware` sets `request.tenant_id` for convenience.
- Username uniqueness is **per-tenant**: two users in different tenants may share the same username.

---

## 3. App Structure

| App             | Responsibility                                         |
|-----------------|--------------------------------------------------------|
| `tenants`       | Tenant, Site models — the root organizational units    |
| `iam`           | User, UserProfile, UserSiteAssignment, auth flows      |
| `core`          | AuditLog, IdempotencyRecord, RequestLog, middleware    |
| `assets`        | AssetClassification, Asset (versioned), BulkImportJob  |
| `foodservice`   | Recipe, Dish, Menu — all with version state machines   |
| `meetings`      | Meeting, AgendaItem, Resolution, Task                  |
| `integrations`  | Alert, WebhookEndpoint, WebhookDeliveryAttempt         |
| `analytics`     | AnalyticsSummary (read-only aggregates)                |

---

## 4. State Machines

### 4.1 User Account Status

```
PENDING_REVIEW ──► ACTIVE ──► SUSPENDED ──► ACTIVE
       │              │              │
       ▼              ▼              ▼
  DEACTIVATED    DEACTIVATED    DEACTIVATED
       │
   (terminal)
```

- `DEACTIVATED` is the only terminal state.
- Every transition creates an immutable `AccountStatusHistory` record.
- A `reason` string is required for every transition.

---

### 4.2 RecipeVersion / DishVersion

```
DRAFT ──activate()──► ACTIVE ──archive()──► ARCHIVED
                         │
              (auto on next activate)
                         ▼
                     SUPERSEDED
```

- Only one `ACTIVE` version per recipe/dish at any time (enforced by partial unique index).
- `activate()` atomically supersedes the current `ACTIVE` version.
- `SUPERSEDED` and `ARCHIVED` are terminal (no exit transitions).

---

### 4.3 MenuVersion

```
DRAFT ──publish()──► PUBLISHED ──unpublish()──► UNPUBLISHED ──archive()──► ARCHIVED
```

- Publishing requires: ≥ 1 group → ≥ 1 item → all dish versions must be `ACTIVE`.
- Publishing to a site auto-unpublishes the previously published version for that site.
- `ARCHIVED` is terminal.

---

### 4.4 Meeting

```
DRAFT ──► SCHEDULED ──► IN_PROGRESS ──► COMPLETED
  │             │               │
  └──────────── ▼ ──────────────┘
             CANCELLED
```

- `DRAFT → SCHEDULED` requires ≥ 1 agenda item.
- `COMPLETED` and `CANCELLED` are terminal.
- Every transition writes an `AuditLog` entry.

---

### 4.5 Task (within Resolution)

```
TODO ──► IN_PROGRESS ──► DONE
  │             │
  └─────────────┴──► CANCELLED
  
OVERDUE ──► IN_PROGRESS
OVERDUE ──► CANCELLED
```

- `DONE` and `CANCELLED` are terminal.
- `OVERDUE` is set by `Task.mark_overdue()` (class method) on past-due `TODO`/`IN_PROGRESS` tasks.
- `Resolution.update_status()` is called after each task transition to recompute resolution status.

---

### 4.6 Alert

```
OPEN ──► ACKNOWLEDGED ──► ASSIGNED ──► CLOSED
```

- `CLOSED` is terminal (requires `resolution_note` ≥ 10 characters).
- `acknowledged_at`, `acknowledged_by` set on `ACKNOWLEDGED`.
- `closed_at`, `closed_by` set on `CLOSED`.

---

### 4.7 BulkImportJob

```
PENDING ──► PROCESSING ──► PREVIEW_READY ──► CONFIRMED
                │
                ▼
              FAILED
```

- Processing runs in a Celery task.
- `CONFIRMED` and `FAILED` are terminal.

---

## 5. Versioning Pattern

Assets, Recipes, Dishes, and Menus all use an append-only versioning pattern:

1. Parent model (`Recipe`, `Asset`, etc.) holds a `current_version` FK.
2. Version model is **immutable** after creation (overrides `save()` and `delete()` to raise `PermissionError`).
3. `version_number` is assigned inside a `SELECT FOR UPDATE` to prevent race conditions.
4. For assets: `fingerprint = SHA-256(site_id|asset_code.lower|name.lower|classification.code)` — used for deduplication.

---

## 6. Middleware Stack

Order (outermost → innermost):

```
TenantMiddleware          — sets request.tenant_id
AccountStatusMiddleware   — blocks PENDING_REVIEW/DEACTIVATED/SUSPENDED users
IdempotencyMiddleware     — deduplicates POST requests by Idempotency-Key header
RateLimitMiddleware       — 100 req/min per tenant (Redis sliding window)
RequestLoggingMiddleware  — async logs every request to RequestLog table
```

---

## 7. Idempotency

POST requests may include an `Idempotency-Key` header. When present:
1. First request: processes normally, stores `IdempotencyRecord` with response body.
2. Subsequent requests with same key: returns cached response immediately with `X-Idempotency-Replayed: true` header.
3. Non-2xx and non-JSON responses are **not** cached.

---

## 8. Security Design

| Concern              | Approach                                              |
|----------------------|-------------------------------------------------------|
| Authentication       | DRF `TokenAuthentication`                             |
| Password hashing     | Django PBKDF2-SHA256 (built-in)                       |
| Government ID        | AES-256-GCM field encryption (`core.encryption`)      |
| Account lockout      | 5 failures → 15-minute lockout (absolute, not sliding)|
| Rate limiting        | Redis sliding window: 100 req/min per tenant          |
| Tenant isolation     | FK + queryset filtering enforced in every view        |
| Immutable audit logs | `save()`/`delete()` overrides raise `PermissionError` |
| Request integrity    | CSRF token (`X-CSRFToken`) for session-authenticated requests; Bearer token (`Authorization: Token <tok>`) for all API calls. Together these prevent CSRF and ensure only legitimate, authenticated clients can mutate state. HMAC-per-request signing is intentionally omitted: embedding a shared secret in client-side JS would be visible to every user and provide no meaningful additional protection over the existing controls. |

---

## 9. Data Flows

### 9.1 New User Registration

```
Client POST /api/v1/auth/register/
  → validate org_code (tenant slug)
  → create User (status=PENDING_REVIEW)
  → create UserProfile (photo_id_review_status=PENDING)
  → return 201 {id, username, status}
Admin reviews in /api/v1/iam/admin/users/
  → POST /transition/ {new_status: ACTIVE, reason: "..."}
  → AccountStatusHistory created
  → User now able to log in fully
```

### 9.2 Menu Publish Flow

```
Staff creates Menu → MenuVersion (DRAFT)
  → adds MenuGroups + MenuGroupItems (with ACTIVE DishVersions)
Staff POSTs /publish/ {site_ids: [...]}
  → validates groups ≥1, items ≥1, all dish versions ACTIVE
  → validates STAFF may only publish to assigned sites
  → auto-unpublishes previous PUBLISHED version for those sites
  → creates MenuSiteRelease records
  → MenuVersion.status = PUBLISHED
  → fires MENU_PUBLISHED webhook event
```

### 9.3 Bulk Asset Import Flow

```
Admin uploads CSV → POST /api/v1/assets/import/
  → BulkImportJob created (PENDING)
  → Celery task queued
  → Celery: PROCESSING → parse CSV rows → validate each row
  → PREVIEW_READY: results_json has {valid, errors}
Admin reviews preview
  → POST /confirm/ → CONFIRMED
  → Asset records created/updated in DB
  → AssetVersion records written (immutable)
```

---

## 10. Frontend Architecture

- **Framework:** React 18 with TypeScript
- **Routing:** React Router v6 (data-driven `createBrowserRouter`)
- **Styling:** Inline CSS with a design token system (`src/tokens.ts`)
- **API client:** Axios with a shared `api.ts` instance (base URL from `VITE_API_URL`)
- **Auth:** Token stored in `localStorage`, injected via Axios request interceptor
- **State:** Local component state + React Context for auth (`AuthContext`)
- **Layout:** Collapsible sidebar with role-based navigation, sticky header

### Design Token System

All visual values flow from `src/tokens.ts`:
- `colors` — semantic color palette (primary, surface, border, text, sidebar, etc.)
- `font` — family, size scale, weight scale
- `radius` — border radius scale
- `shadows` — box-shadow levels
- `transition` — CSS transition strings

---

## 11. Testing Strategy

| Layer         | Tool                    | Location                  |
|---------------|-------------------------|---------------------------|
| Unit (models) | pytest + factory_boy    | `tests/unit/`             |
| API (HTTP)    | pytest + DRF APIClient  | `tests/api/`              |
| Coverage      | pytest-cov              | `make coverage` (≥80%)    |

**Factories** live in `iam/factories.py` and `assets/factories.py`. All tests use factories — never raw `Model.objects.create()` (except where testing DB constraints directly).
