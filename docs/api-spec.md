# HarborOps API Specification

**Base URL:** `/api/v1/`  
**Authentication:** Token authentication — include `Authorization: Token <token>` header.  
**Content-Type:** `application/json`

---

## Table of Contents

1. [Core](#1-core)
2. [Auth (IAM)](#2-auth-iam)
3. [Admin (IAM)](#3-admin-iam)
4. [Tenants](#4-tenants)
5. [Assets](#5-assets)
6. [Bulk Import](#6-bulk-import)
7. [Foodservice — Recipes](#7-foodservice--recipes)
8. [Foodservice — Dishes](#8-foodservice--dishes)
9. [Foodservice — Menus](#9-foodservice--menus)
10. [Meetings](#10-meetings)
11. [Integrations — Alerts](#11-integrations--alerts)
12. [Integrations — Webhooks](#12-integrations--webhooks)
13. [Analytics](#13-analytics)
14. [Error Format](#14-error-format)

---

## 1. Core

### `GET /api/v1/core/health/`

Liveness and readiness probe. No authentication required.

**Response 200**
```json
{
  "status": "ok",
  "timestamp": "2026-04-10T12:00:00.000000+00:00",
  "database": "ok",
  "redis": "ok"
}
```

**Response 503** (when database is unreachable)
```json
{
  "status": "degraded",
  "timestamp": "2026-04-10T12:00:00.000000+00:00",
  "database": "error: connection refused",
  "redis": "ok"
}
```

---

### `GET /api/v1/core/audit-log/`

Returns the last 20 audit log entries for the current user's tenant, newest first.  
**Roles:** ADMIN, STAFF (COURIER → 403)

**Response 200**
```json
[
  {
    "id": "uuid",
    "entity_type": "Asset",
    "entity_id": "uuid",
    "action": "CREATE",
    "actor_username": "alice.staff",
    "timestamp": "2026-04-10T11:00:00+00:00"
  }
]
```

---

## 2. Auth (IAM)

### `POST /api/v1/auth/login/`

Authenticate and receive a token. No auth required.

**Request**
```json
{ "username": "alice", "password": "Secret@1!" }
```

**Response 200**
```json
{ "token": "abc123...", "user_id": "uuid", "role": "STAFF" }
```

**Response 401** — invalid credentials  
**Response 423** — account locked (too many failures)  
**Response 403** — account not ACTIVE

---

### `POST /api/v1/auth/logout/`

Invalidate the current token. Requires authentication.

**Response 204** — no content

---

### `POST /api/v1/auth/register/`

Register a new user account (status starts as PENDING_REVIEW). No auth required.

**Request**
```json
{
  "username": "newuser",
  "password": "Secret@1!",
  "legal_first_name": "Jane",
  "legal_last_name": "Doe",
  "employee_student_id": "EMP007",
  "org_code": "coastal-university"
}
```

**Response 201**
```json
{ "id": "uuid", "username": "newuser", "status": "PENDING_REVIEW" }
```

---

### `GET /api/v1/auth/me/`

Return the current authenticated user's profile.

**Response 200**
```json
{
  "id": "uuid",
  "username": "alice",
  "role": "STAFF",
  "status": "ACTIVE",
  "tenant_id": "uuid",
  "profile": {
    "legal_first_name": "Alice",
    "legal_last_name": "Nguyen",
    "employee_student_id": "STF001",
    "government_id_mask": "*****6789"
  }
}
```

---

## 3. Admin (IAM)

All endpoints require ADMIN role.

### `GET /api/v1/iam/admin/users/`

List all users in the tenant.

**Response 200** — list of user objects

---

### `GET /api/v1/iam/admin/users/{id}/`

Retrieve a single user.

---

### `POST /api/v1/iam/admin/users/{id}/transition/`

Change a user's account status.

**Request**
```json
{ "new_status": "ACTIVE", "reason": "Approved after review." }
```

**Valid transitions:**

| From            | To                        |
|-----------------|---------------------------|
| PENDING_REVIEW  | ACTIVE, DEACTIVATED       |
| ACTIVE          | SUSPENDED, DEACTIVATED    |
| SUSPENDED       | ACTIVE, DEACTIVATED       |
| DEACTIVATED     | *(terminal — no exits)*   |

**Response 200** — updated user  
**Response 422** — invalid transition

---

## 4. Tenants

### `GET /api/v1/tenants/sites/`

List sites visible to the current user.

- **ADMIN** → all active sites in tenant
- **STAFF / COURIER** → only assigned active sites

---

### Tenant Administration (superuser only)

All endpoints below require `is_superuser=True`. Regular tenant users (ADMIN/STAFF/COURIER) receive 403.

#### `GET /api/v1/admin/tenants/`
List all tenants.

#### `POST /api/v1/admin/tenants/`
Create a tenant. Body: `{ "name": "...", "slug": "...", "is_active": true }`

#### `GET /api/v1/admin/tenants/<id>/`
Retrieve a single tenant.

#### `PATCH /api/v1/admin/tenants/<id>/`
Update `name`, `slug`, or `is_active`.

#### `GET /api/v1/admin/tenants/<id>/sites/`
List all sites (active and inactive) for a tenant.

#### `POST /api/v1/admin/tenants/<id>/sites/`
Create a site under a tenant. Body: `{ "name": "...", "address": "...", "timezone": "America/New_York", "is_active": true }`

#### `PATCH /api/v1/admin/tenants/<id>/sites/<site_id>/`
Update a site's `name`, `address`, `timezone`, or `is_active`.

**Response 200**
```json
[
  {
    "id": "uuid",
    "name": "Main Campus",
    "address": "1 University Ave",
    "timezone": "America/New_York",
    "is_active": true
  }
]
```

---

## 5. Assets

### `GET /api/v1/assets/`

List assets for the current tenant (non-deleted).

**Query params:** `?site=<site_id>` `?classification=<code>` `?search=<text>`

**Response 200** — paginated list of assets with `current_version`

---

### `POST /api/v1/assets/`

Create a new asset. Requires ADMIN or STAFF role.

**Request**
```json
{
  "site_id": "uuid",
  "asset_code": "OVEN-001",
  "name": "Convection Oven Alpha",
  "classification_id": "uuid",
  "data": { "status": "operational", "serial": "SN12345" }
}
```

**Response 201** — created asset  
**Response 409** — duplicate fingerprint (same site + code + name + classification)  
**Response 422** — validation error

---

### `GET /api/v1/assets/{id}/`

Retrieve a single asset with version history.

---

### `PATCH /api/v1/assets/{id}/`

Update asset fields (creates a new version). Requires ADMIN or STAFF.

---

### `DELETE /api/v1/assets/{id}/`

Soft-delete an asset (`is_deleted=True`). Requires ADMIN.

---

### `GET /api/v1/assets/{id}/versions/`

List all immutable versions of an asset.

---

### `GET /api/v1/assets/classifications/`

List all active asset classifications for the tenant.

---

## 6. Bulk Import

### `POST /api/v1/assets/import/`

Upload a CSV/XLSX file to create or update assets in bulk.

**Content-Type:** `multipart/form-data`  
**Fields:** `file`, `site_id`

**Response 202**
```json
{ "job_id": "uuid", "status": "PENDING" }
```

---

### `GET /api/v1/assets/import/{job_id}/`

Poll the status of a bulk import job.

**Status values:** `PENDING` → `PROCESSING` → `PREVIEW_READY` → `CONFIRMED` or `FAILED`

**Response 200**
```json
{
  "id": "uuid",
  "status": "PREVIEW_READY",
  "total_rows": 42,
  "results_json": {
    "valid": 40,
    "errors": [
      { "row": 5, "field": "asset_code", "message": "Invalid format" }
    ]
  }
}
```

---

### `POST /api/v1/assets/import/{job_id}/confirm/`

Confirm a PREVIEW_READY job to apply the changes.

**Response 200** — job moves to `CONFIRMED`

---

## 7. Foodservice — Recipes

### `GET /api/v1/foodservice/recipes/`

List recipes for the tenant.

---

### `POST /api/v1/foodservice/recipes/`

Create a recipe. Requires ADMIN or STAFF.

**Request**
```json
{ "name": "Classic Marinara Sauce" }
```

---

### `GET /api/v1/foodservice/recipes/{id}/`

Retrieve a recipe with its active version and all versions.

---

### `POST /api/v1/foodservice/recipes/{id}/versions/`

Create a new DRAFT version.

**Request**
```json
{
  "effective_from": "2026-05-01",
  "servings": "8.0000",
  "ingredients": [
    { "ingredient_name": "Tomatoes", "quantity": "28.0000", "unit": "oz", "unit_cost": "0.0500" }
  ],
  "steps": [
    { "step_number": 1, "instruction": "Crush the tomatoes." }
  ]
}
```

---

### `POST /api/v1/foodservice/recipes/{id}/versions/{version_id}/activate/`

Activate a DRAFT version (DRAFT → ACTIVE). Previous ACTIVE → SUPERSEDED.  
Requires ADMIN.

**Response 200** — updated version

---

### `POST /api/v1/foodservice/recipes/{id}/versions/{version_id}/archive/`

Archive an ACTIVE version. Requires ADMIN.

---

## 8. Foodservice — Dishes

Same structure as Recipes:

- `GET/POST /api/v1/foodservice/dishes/`
- `GET /api/v1/foodservice/dishes/{id}/`
- `POST /api/v1/foodservice/dishes/{id}/versions/`
- `POST /api/v1/foodservice/dishes/{id}/versions/{vid}/activate/`
- `POST /api/v1/foodservice/dishes/{id}/versions/{vid}/archive/`

**DishVersion extra fields:** `name`, `description`, `per_serving_cost`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `allergens[]`

**Nutrition rule:** All four nutrition fields must be provided together or not at all.  
**Allergen rule:** `NONE` code cannot be combined with any other allergen code.

---

## 9. Foodservice — Menus

### `GET/POST /api/v1/foodservice/menus/`

### `GET /api/v1/foodservice/menus/{id}/`

### `POST /api/v1/foodservice/menus/{id}/versions/`

Create a DRAFT MenuVersion with groups and items.

### `POST /api/v1/foodservice/menus/{id}/versions/{vid}/publish/`

Publish a DRAFT version.

**Request**
```json
{ "site_ids": ["uuid1", "uuid2"] }
```

**Prerequisites:**
- ≥ 1 group with ≥ 1 item
- All dish versions in all groups must be ACTIVE
- STAFF may only publish to their assigned sites

**Response 200** — published version. Previously PUBLISHED version for those sites → UNPUBLISHED.

### `POST /api/v1/foodservice/menus/{id}/versions/{vid}/unpublish/`

PUBLISHED → UNPUBLISHED.

### `POST /api/v1/foodservice/menus/{id}/versions/{vid}/archive/`

UNPUBLISHED → ARCHIVED.

---

## 10. Meetings

### `GET/POST /api/v1/meetings/`

### `GET/PATCH /api/v1/meetings/{id}/`

### Meeting Status Machine

| From        | To                        |
|-------------|---------------------------|
| DRAFT       | SCHEDULED, CANCELLED      |
| SCHEDULED   | IN_PROGRESS, CANCELLED    |
| IN_PROGRESS | COMPLETED, CANCELLED      |
| COMPLETED   | *(terminal)*              |
| CANCELLED   | *(terminal)*              |

**Note:** DRAFT → SCHEDULED requires ≥ 1 agenda item.

### `POST /api/v1/meetings/{id}/transition/`

```json
{ "new_status": "SCHEDULED" }
```

### `GET/POST /api/v1/meetings/{id}/agenda-items/`

### `GET/PATCH /api/v1/meetings/{id}/agenda-items/{item_id}/`

### `GET/PATCH /api/v1/meetings/{id}/minutes/`

### `GET /api/v1/meetings/{id}/resolutions/`

### `POST /api/v1/meetings/{id}/resolutions/{res_id}/tasks/`

### Task Status Machine

| From        | To                        |
|-------------|---------------------------|
| TODO        | IN_PROGRESS, CANCELLED    |
| IN_PROGRESS | DONE, CANCELLED           |
| DONE        | *(terminal)*              |
| CANCELLED   | *(terminal)*              |
| OVERDUE     | IN_PROGRESS, CANCELLED    |

---

## 11. Integrations — Alerts

### `GET /api/v1/integrations/alerts/`

List alerts for the tenant.

### `GET /api/v1/integrations/alerts/{id}/`

### `POST /api/v1/integrations/alerts/{id}/transition/`

**Request**
```json
{
  "new_status": "ACKNOWLEDGED"
}
```

For CLOSED: also requires `resolution_note` (≥ 10 characters).

**Alert Status Machine:**

| From         | To           |
|--------------|--------------|
| OPEN         | ACKNOWLEDGED |
| ACKNOWLEDGED | ASSIGNED     |
| ASSIGNED     | CLOSED       |
| CLOSED       | *(terminal)* |

---

## 12. Integrations — Webhooks

### `GET/POST /api/v1/integrations/webhooks/`

### `GET/PATCH/DELETE /api/v1/integrations/webhooks/{id}/`

**Webhook payload** (sent on events):
```json
{
  "event": "MENU_PUBLISHED",
  "tenant_id": "uuid",
  "timestamp": "2026-04-10T12:00:00Z",
  "data": { ... }
}
```

Delivery attempts are retried up to 3 times with exponential backoff.

---

## 13. Analytics

### `GET /api/v1/analytics/summary/`

Returns an AnalyticsSummary for the tenant. Requires ADMIN or STAFF.

**Response 200**
```json
{
  "tenant_id": "uuid",
  "period_start": "2026-04-01",
  "period_end": "2026-04-10",
  "total_assets": 42,
  "active_menus": 3,
  "open_alerts": 2,
  "meetings_this_month": 5
}
```

---

## 14. Error Format

All errors follow this structure:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Human-readable summary.",
    "details": {
      "field_name": ["Error message."]
    }
  }
}
```

**Common codes:**

| HTTP | code              | Meaning                                |
|------|-------------------|----------------------------------------|
| 400  | `validation_error`| Request body failed validation         |
| 401  | `authentication_required` | No/invalid token              |
| 403  | `permission_denied` | Authenticated but not authorised     |
| 404  | `not_found`       | Resource does not exist                |
| 409  | `conflict`        | Duplicate resource (e.g. fingerprint)  |
| 422  | `unprocessable`   | Business rule violation (state machine)|
| 429  | `rate_limited`    | Too many requests                      |
| 503  | `service_unavailable` | Database/dependency down           |
