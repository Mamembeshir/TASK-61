# HarborOps Operations & Compliance Platform — Implementation Specification

---

## 1. Title

**HarborOps Operations & Compliance Platform v1.0**
A multi-site facility asset control, foodservice production governance, and internal collaboration system for organizations operating cafeterias and shared equipment.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18+ (TypeScript), React Router, Axios | Single-page app; no SSR required |
| Backend | Django 5.x (Python 3.12+), Django REST Framework | Enforces all business logic server-side |
| Database | MySQL 8.0+ | All operational data; InnoDB engine with row-level locking |
| Authentication | Django auth with custom backend | Salted PBKDF2-SHA256 hashing (Django default) |
| Encryption at Rest | AES-256-GCM via `cryptography` library | For sensitive PII fields |
| File Storage | Local filesystem (configurable path) | Photo ID uploads, spreadsheet imports |
| Message Queue | Celery with Redis broker (local) | Optional; for webhooks, bulk jobs, alerts |
| API Protocol | REST over HTTPS (or HTTP for air-gapped LAN) | JSON request/response; versioned endpoints |

---

## 3. Execution Contract

### 3.1 Offline Constraints
- The system MUST be fully functional without internet connectivity.
- All computation, validation, queue processing, and storage are local.
- No external CDN, SaaS API, cloud service, or DNS dependency is permitted at runtime.
- The React frontend bundle is served from the Django static files or a local reverse proxy.

### 3.2 Determinism Requirement
- All monetary calculations use Python `Decimal` with `ROUND_HALF_UP`, truncated to 2 decimal places (cents).
- All date/time values are stored in UTC. Display converts to the configured site timezone.
- Bulk import deduplication uses a deterministic fingerprint: `SHA-256(lowercase(concat(key_field_1, '|', key_field_2, ...)))`.
- Recipe/menu version effective dates are enforced server-side; exactly one active version per entity per site at any point in time.

### 3.3 No External Dependency Rules
- No calls to external APIs during any request lifecycle.
- All npm packages are vendored or installed from a local registry during build.
- Python packages are installed from a local wheelhouse or requirements file.

### 3.4 Assumptions Policy
- All assumptions are documented in `ASSUMPTIONS.md` at the repository root.
- Each assumption includes: ID, description, default chosen, rationale, and override instructions.

---

## 4. Product Overview

### 4.1 System Purpose
HarborOps provides a unified platform for organizations that operate cafeterias and shared equipment across multiple physical sites. It consolidates asset tracking, foodservice recipe/menu management, and internal meeting governance into a single auditable system with strict role-based access control, offline operation, and compliance-ready audit trails.

### 4.2 User Roles

| Role | Description |
|---|---|
| Administrator | Manages tenants, user accounts, permissions, audits, system configuration |
| Staff | Asset custodians and kitchen leads; operate guided workflows |
| Courier | Internal delivery handoff only; view-only for assigned tasks |

### 4.3 Core Domains

1. **Identity & Access** — Onboarding, authentication, role management, account lifecycle
2. **Asset Ledger** — Classification, coding, versioned history, bulk import/export
3. **Foodservice Production** — Dishes, recipes, menus, nutrition, cost rollups
4. **Meeting Workspace** — Agendas, attendance, minutes, resolutions, task tracking
5. **Analytics & Monitoring** — KPIs, anomaly alerts, job health
6. **Integration Layer** — Webhooks, message queue, idempotency

---

## 5. In-Scope Domains (Modules)

| Module | Key Capabilities |
|---|---|
| `iam` | User registration, onboarding review, login, lockout, role assignment, account status lifecycle, audit log |
| `tenants` | Multi-tenant isolation, site management, tenant-level configuration |
| `assets` | Asset CRUD, classification codes, version snapshots, bulk import/export, duplicate detection, as-of timeline |
| `foodservice` | Dish master data, recipes with versioning, menus with publish controls, nutrition/allergen, cost rollups |
| `meetings` | Meeting CRUD, agenda items, attendance, minutes, resolutions, resolution-to-task conversion, task tracking |
| `analytics` | Dashboard KPIs, funnel metrics, alert lifecycle |
| `integrations` | Webhook dispatch, message queue, idempotency, retry policies |
| `core` | Shared utilities: pagination, encryption, file handling, validation helpers |

---

## 6. Out of Scope (MANDATORY)

The following are explicitly **not** part of this specification:

1. **External SSO / OAuth / SAML** — Authentication is local username/password only.
2. **Payment processing** — No payment gateway integration.
3. **Customer-facing ordering** — This is an internal operations tool, not a POS or e-commerce system.
4. **Inventory procurement** — No purchase orders, vendor management, or supply chain.
5. **Real-time chat or video** — Meeting workspace is document-based, not real-time communication.
6. **Mobile native apps** — React web only; responsive design is acceptable but native builds are out of scope.
7. **Multi-language / i18n** — English only per specification.
8. **Cloud deployment automation** — System targets on-premises; Dockerfiles may be provided for convenience but cloud orchestration (Kubernetes, Terraform) is out of scope.
9. **Barcode / QR scanning** — Asset identification is manual or via spreadsheet import.
10. **Email notifications** — No external email service; all notifications are in-app or via local webhooks.

---

## 7. Actors & Roles

### 7.1 Role Definitions

| Role | Abbrev | Scope |
|---|---|---|
| Administrator | ADMIN | Full system access; manages tenants, users, permissions, audits |
| Staff | STAFF | Operates within assigned site(s); asset and kitchen workflows |
| Courier | COURIER | View-only for assigned pickup/drop tasks; sign-in confirmation |
| System | SYSTEM | Automated processes (jobs, queue workers); not a human role |

### 7.2 Role Assignment Rules

- Every user has exactly one role.
- Role is assigned by an ADMIN during or after onboarding approval.
- COURIER accounts can only be created/enabled by an ADMIN; self-registration always creates a STAFF account in Pending Review.
- ADMIN role requires explicit promotion by another ADMIN; there is no self-promotion.
- The system must have at least one ADMIN account (seeded during initial setup).

### 7.3 Site Scoping

- STAFF and COURIER users are assigned to one or more sites.
- ADMIN users have cross-site access.
- All data queries for STAFF and COURIER are filtered to their assigned site(s) unless the query is explicitly cross-site and the user has ADMIN role.

---

## 8. Core Data Model

### 8.1 Entity Relationship Summary

```
Tenant 1──* Site
Tenant 1──* User
User *──* Site (through UserSiteAssignment)
User 1──* AccountStatusHistory
User 1──1 UserProfile (legal name, employee/student ID, photo ID file)

Site 1──* Asset
Asset 1──* AssetVersion (snapshot per change)
Asset *──1 AssetClassification

Site 1──* Dish
Dish 1──* DishVersion
Dish *──* Allergen
DishVersion 1──* DishAddon
DishVersion 1──* DishPortionSpec

Recipe 1──* RecipeVersion
RecipeVersion 1──* RecipeIngredient
RecipeVersion 1──* RecipeStep
Dish *──1 Recipe

Menu 1──* MenuVersion
MenuVersion 1──* MenuGroup
MenuGroup 1──* MenuGroupItem (references DishVersion)
MenuVersion *──* Site (through MenuSiteRelease)
MenuVersion has AvailabilityWindow (start_time, end_time)

Meeting 1──* AgendaItem
Meeting 1──* MeetingAttendance
Meeting 1──* MeetingMinute
Meeting 1──* Resolution
Resolution 1──* Task
Task has status, assignee, due_date, progress notes

Alert 1──1 AlertAcknowledgement
Alert 1──1 AlertAssignment
Alert 1──1 AlertResolution

WebhookEndpoint 1──* WebhookDeliveryAttempt
```

### 8.2 Key Entity Details

#### User
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| tenant_id | FK(Tenant) | NOT NULL |
| username | VARCHAR(150) | UNIQUE per tenant |
| password_hash | VARCHAR(255) | PBKDF2-SHA256 |
| role | ENUM(ADMIN, STAFF, COURIER) | NOT NULL |
| status | ENUM(PENDING_REVIEW, ACTIVE, SUSPENDED, DEACTIVATED) | NOT NULL, default PENDING_REVIEW |
| failed_login_count | INT | Default 0 |
| locked_until | DATETIME | NULL |
| created_at | DATETIME | UTC |
| updated_at | DATETIME | UTC |

#### UserProfile
| Field | Type | Constraints |
|---|---|---|
| user_id | FK(User) | PK |
| legal_first_name | VARCHAR(100) | NOT NULL |
| legal_last_name | VARCHAR(100) | NOT NULL |
| employee_student_id | VARCHAR(50) | NOT NULL |
| government_id_encrypted | BLOB | AES-256-GCM encrypted |
| government_id_mask | VARCHAR(20) | e.g., "***-**-1234" |
| photo_id_file_path | VARCHAR(500) | Local filesystem path |
| photo_id_review_status | ENUM(PENDING, APPROVED, REJECTED) | Default PENDING |

#### AccountStatusHistory
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | FK(User) | NOT NULL |
| old_status | ENUM | NOT NULL |
| new_status | ENUM | NOT NULL |
| changed_by | FK(User) | NOT NULL (ADMIN or SYSTEM) |
| reason | TEXT | NOT NULL |
| timestamp | DATETIME | UTC, auto-set |

#### Asset
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| site_id | FK(Site) | NOT NULL |
| asset_code | VARCHAR(50) | UNIQUE per site |
| name | VARCHAR(200) | NOT NULL |
| classification_id | FK(AssetClassification) | NOT NULL |
| current_version_id | FK(AssetVersion) | NOT NULL |
| fingerprint | VARCHAR(64) | SHA-256 of key attributes |
| created_at | DATETIME | UTC |
| is_deleted | BOOLEAN | Soft delete, default FALSE |

#### AssetVersion
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| asset_id | FK(Asset) | NOT NULL |
| version_number | INT | Auto-increment per asset |
| data_snapshot | JSON | Full field snapshot |
| change_source | ENUM(MANUAL, BULK_IMPORT, CORRECTION) | NOT NULL |
| changed_by | FK(User) | NOT NULL |
| created_at | DATETIME | UTC |

#### Recipe / RecipeVersion
| Field | Type | Constraints |
|---|---|---|
| recipe.id | UUID | PK |
| recipe.name | VARCHAR(200) | NOT NULL |
| recipe.tenant_id | FK(Tenant) | NOT NULL |
| version.id | UUID | PK |
| version.recipe_id | FK(Recipe) | NOT NULL |
| version.version_number | INT | Auto-increment per recipe |
| version.effective_from | DATE | NOT NULL |
| version.effective_to | DATE | NULL (open-ended if current) |
| version.status | ENUM(DRAFT, ACTIVE, SUPERSEDED, ARCHIVED) | NOT NULL |
| version.created_by | FK(User) | NOT NULL |
| version.created_at | DATETIME | UTC |

#### RecipeIngredient
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| recipe_version_id | FK(RecipeVersion) | NOT NULL |
| ingredient_name | VARCHAR(200) | NOT NULL |
| quantity | DECIMAL(10,4) | NOT NULL, > 0 |
| unit | ENUM(oz, lb, cup, tbsp, tsp, fl_oz, gal, qt, pt, each, pinch) | US units |
| unit_cost | DECIMAL(10,4) | Cost per unit, NOT NULL |
| sort_order | INT | NOT NULL |

#### RecipeStep
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| recipe_version_id | FK(RecipeVersion) | NOT NULL |
| step_number | INT | NOT NULL, >= 1 |
| instruction | TEXT | NOT NULL, max 2000 chars |

#### Dish / DishVersion
| Field | Type | Constraints |
|---|---|---|
| dish.id | UUID | PK |
| dish.tenant_id | FK(Tenant) | NOT NULL |
| dish.recipe_id | FK(Recipe) | NULL (optional) |
| version.id | UUID | PK |
| version.dish_id | FK(Dish) | NOT NULL |
| version.name | VARCHAR(200) | NOT NULL |
| version.description | TEXT | Max 1000 chars |
| version.allergen_ids | M2M(Allergen) | Through table |
| version.calories | DECIMAL(8,2) | NULL |
| version.protein_g | DECIMAL(8,2) | NULL |
| version.carbs_g | DECIMAL(8,2) | NULL |
| version.fat_g | DECIMAL(8,2) | NULL |
| version.per_serving_cost | DECIMAL(10,2) | Server-computed from recipe |
| version.effective_from | DATE | NOT NULL |
| version.effective_to | DATE | NULL |
| version.status | ENUM(DRAFT, ACTIVE, SUPERSEDED, ARCHIVED) | NOT NULL |

#### DishPortionSpec
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| dish_version_id | FK(DishVersion) | NOT NULL |
| portion_label | VARCHAR(100) | e.g., "Regular", "Large" |
| serving_size_qty | DECIMAL(8,2) | NOT NULL |
| serving_size_unit | VARCHAR(20) | e.g., "oz", "each" |
| price_multiplier | DECIMAL(5,2) | Default 1.00 |

#### DishAddon
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| dish_version_id | FK(DishVersion) | NOT NULL |
| addon_name | VARCHAR(200) | NOT NULL |
| additional_cost | DECIMAL(10,2) | NOT NULL, >= 0 |
| allergen_ids | M2M(Allergen) | Through table |

#### Menu / MenuVersion
| Field | Type | Constraints |
|---|---|---|
| menu.id | UUID | PK |
| menu.tenant_id | FK(Tenant) | NOT NULL |
| menu.name | VARCHAR(200) | NOT NULL |
| version.id | UUID | PK |
| version.menu_id | FK(Menu) | NOT NULL |
| version.version_number | INT | Auto-increment |
| version.status | ENUM(DRAFT, PUBLISHED, UNPUBLISHED, ARCHIVED) | NOT NULL |
| version.effective_from | DATE | NOT NULL |
| version.effective_to | DATE | NULL |
| version.published_at | DATETIME | NULL |
| version.published_by | FK(User) | NULL |

#### MenuGroup
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| menu_version_id | FK(MenuVersion) | NOT NULL |
| group_name | VARCHAR(200) | NOT NULL |
| sort_order | INT | NOT NULL |
| availability_start | TIME | e.g., 06:00 |
| availability_end | TIME | e.g., 10:30 |

#### MenuGroupItem
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| menu_group_id | FK(MenuGroup) | NOT NULL |
| dish_version_id | FK(DishVersion) | NOT NULL |
| sort_order | INT | NOT NULL |
| is_featured | BOOLEAN | Default FALSE |

#### MenuSiteRelease
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| menu_version_id | FK(MenuVersion) | NOT NULL |
| site_id | FK(Site) | NOT NULL |
| released_at | DATETIME | UTC |
| released_by | FK(User) | NOT NULL |
| UNIQUE | (menu_version_id, site_id) | |

#### Meeting
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| tenant_id | FK(Tenant) | NOT NULL |
| site_id | FK(Site) | NULL (cross-site if NULL) |
| title | VARCHAR(300) | NOT NULL |
| scheduled_at | DATETIME | NOT NULL |
| status | ENUM(DRAFT, SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED) | NOT NULL |
| created_by | FK(User) | NOT NULL |

#### AgendaItem
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| meeting_id | FK(Meeting) | NOT NULL |
| title | VARCHAR(300) | NOT NULL |
| description | TEXT | Max 2000 chars |
| sort_order | INT | NOT NULL |
| submitted_by | FK(User) | NOT NULL |
| attachment_path | VARCHAR(500) | NULL |

#### Resolution
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| meeting_id | FK(Meeting) | NOT NULL |
| agenda_item_id | FK(AgendaItem) | NULL |
| text | TEXT | NOT NULL |
| status | ENUM(OPEN, IN_PROGRESS, COMPLETED, CANCELLED) | Default OPEN |

#### Task
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| resolution_id | FK(Resolution) | NOT NULL |
| title | VARCHAR(300) | NOT NULL |
| assignee_id | FK(User) | NOT NULL |
| due_date | DATE | NOT NULL |
| status | ENUM(TODO, IN_PROGRESS, DONE, OVERDUE, CANCELLED) | Default TODO |
| progress_notes | TEXT | NULL |
| completed_at | DATETIME | NULL |

#### Alert
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| tenant_id | FK(Tenant) | NOT NULL |
| alert_type | VARCHAR(100) | e.g., "job_failure", "anomaly_threshold" |
| severity | ENUM(INFO, WARNING, CRITICAL) | NOT NULL |
| message | TEXT | NOT NULL |
| status | ENUM(OPEN, ACKNOWLEDGED, ASSIGNED, CLOSED) | Default OPEN |
| acknowledged_by | FK(User) | NULL |
| acknowledged_at | DATETIME | NULL |
| assigned_to | FK(User) | NULL |
| assigned_at | DATETIME | NULL |
| resolution_note | TEXT | NULL |
| closed_by | FK(User) | NULL |
| closed_at | DATETIME | NULL |
| created_at | DATETIME | UTC |

#### WebhookEndpoint
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| tenant_id | FK(Tenant) | NOT NULL |
| url | VARCHAR(2000) | Must be local/private network URL |
| event_types | JSON | Array of event type strings |
| secret | VARCHAR(256) | For HMAC signing |
| is_active | BOOLEAN | Default TRUE |

#### WebhookDeliveryAttempt
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| endpoint_id | FK(WebhookEndpoint) | NOT NULL |
| idempotency_key | VARCHAR(64) | UNIQUE |
| event_type | VARCHAR(100) | NOT NULL |
| payload | JSON | NOT NULL |
| attempt_number | INT | 1-based |
| status_code | INT | NULL |
| response_body | TEXT | NULL (truncated to 1000 chars) |
| sent_at | DATETIME | UTC |
| next_retry_at | DATETIME | NULL |

---

## 9. Authoritative Business Rules

### 9.1 Onboarding & Account Rules

| Rule ID | Rule |
|---|---|
| ACC-01 | Self-registration creates a user with status=PENDING_REVIEW and role=STAFF. |
| ACC-02 | COURIER accounts are created only by ADMIN; they cannot self-register. |
| ACC-03 | PENDING_REVIEW accounts cannot access any operational module (assets, foodservice, meetings). They see only a "Your account is pending review" screen. |
| ACC-04 | ADMIN approval transitions status to ACTIVE and records a timestamped status history entry. |
| ACC-05 | SUSPENDED accounts cannot perform any write operation. Read access is preserved for STAFF role only to allow viewing their own data. COURIER sees nothing. |
| ACC-06 | All status transitions are recorded in AccountStatusHistory with old_status, new_status, changed_by, reason, and timestamp. |
| ACC-07 | DEACTIVATED is a terminal status. No transitions out of DEACTIVATED are permitted. To re-enable, a new account must be created. |
| ACC-08 | Employee/student ID must be unique within a tenant. |
| ACC-09 | Photo ID file upload accepts JPEG, PNG, PDF only; max file size 10 MB. |

### 9.2 Authentication Rules

| Rule ID | Rule |
|---|---|
| AUTH-01 | Password minimum: 10 characters, at least 1 uppercase, 1 lowercase, 1 digit, 1 special character. |
| AUTH-02 | Failed login increments `failed_login_count`. At 5 failures, set `locked_until = NOW() + 15 minutes`. |
| AUTH-03 | Successful login resets `failed_login_count` to 0 and clears `locked_until`. |
| AUTH-04 | Login attempts against a locked account return a generic "Account locked. Try again later." message; they do NOT reset the lock timer. |
| AUTH-05 | Login attempts against PENDING_REVIEW, SUSPENDED, or DEACTIVATED accounts are rejected with "Account not active." |
| AUTH-06 | Session tokens expire after 8 hours of inactivity. Absolute session lifetime is 24 hours. |
| AUTH-07 | Passwords are stored using Django's PBKDF2-SHA256 with 600,000 iterations and a random salt. |

### 9.3 Asset Ledger Rules

| Rule ID | Rule |
|---|---|
| AST-01 | Asset code format: uppercase alphanumeric + hyphens, 3–50 characters. Validated by regex `^[A-Z0-9\-]{3,50}$`. |
| AST-02 | Asset code must be unique per site. |
| AST-03 | Every change to an asset creates a new AssetVersion snapshot; the prior version is never modified. |
| AST-04 | Bulk import accepts .xlsx and .csv files, max 10,000 rows, max 25 MB file size. |
| AST-05 | Deduplication fingerprint: `SHA-256(site_id + '|' + lowercase(asset_code) + '|' + lowercase(name) + '|' + classification_code)`. |
| AST-06 | If fingerprint matches an existing asset, the row is flagged as "Duplicate" in the import results; user must choose "Update existing" or "Skip". |
| AST-07 | Rejected rows (validation failure) are returned to the user with row number, field name, and error message for inline correction. |
| AST-08 | The "as-of" timeline query accepts a datetime parameter and returns the AssetVersion that was current at that point. |
| AST-09 | Classification codes are hierarchical: parent_code.child_code (e.g., "HVAC.CHILLER"). Max depth 3 levels. |
| AST-10 | Soft-deleted assets are excluded from default queries but remain in the as-of timeline. |

### 9.4 Foodservice Rules

| Rule ID | Rule |
|---|---|
| FS-01 | Exactly one RecipeVersion with status=ACTIVE per recipe at any time. Activating a new version automatically sets the previous ACTIVE version to SUPERSEDED and sets its `effective_to = new_version.effective_from - 1 day`. |
| FS-02 | `effective_from` of a new version must be > `effective_from` of the current ACTIVE version. |
| FS-03 | Per-serving cost = `SUM(ingredient.quantity * ingredient.unit_cost) / recipe.servings`, rounded to 2 decimal places using `ROUND_HALF_UP`. |
| FS-04 | Cost rollup is computed server-side on recipe save; the result is stored on DishVersion.per_serving_cost. Frontend never computes cost. |
| FS-05 | Allergen flags are mandatory: every DishVersion must declare allergens (even if the declaration is "None"). |
| FS-06 | Nutrition panel fields (calories, protein, carbs, fat) are optional but if any is provided, all four must be provided. |
| FS-07 | Menu publish requires: at least one MenuGroup with at least one MenuGroupItem, each referencing an ACTIVE DishVersion. |
| FS-08 | Publishing a MenuVersion for a site where another MenuVersion of the same menu is already PUBLISHED automatically unpublishes the old version. |
| FS-09 | Availability windows: `availability_start < availability_end`. Both are required if either is set. Times are in site-local timezone. |
| FS-10 | Bulk menu release: an ADMIN or STAFF(kitchen lead) can publish a MenuVersion to multiple sites in one operation. Each site release is an independent record. |
| FS-11 | Ingredient quantities use US customary units only. The allowed unit enum is defined in RecipeIngredient. |
| FS-12 | Recipe step instructions maximum 2000 characters per step; minimum 1 step per recipe version. |

### 9.5 Meeting & Task Rules

| Rule ID | Rule |
|---|---|
| MTG-01 | A meeting must have at least one agenda item before it can transition to SCHEDULED. |
| MTG-02 | Attendance sign-in records user_id, signed_at (timestamp), and method (IN_PERSON or MATERIAL_ONLY for offline distribution). |
| MTG-03 | Resolutions can only be created when meeting status is IN_PROGRESS or COMPLETED. |
| MTG-04 | Converting a resolution to a task requires: assignee, title, and due_date. |
| MTG-05 | Tasks with status TODO or IN_PROGRESS whose due_date < today are automatically transitioned to OVERDUE by a daily scheduled job. |
| MTG-06 | A resolution status is COMPLETED only when all its tasks are DONE or CANCELLED. |
| MTG-07 | Meeting minutes are free-text with a maximum of 50,000 characters. |
| MTG-08 | Agenda item attachments: PDF, DOCX, XLSX, PPTX, PNG, JPG only; max 20 MB per file; max 10 files per meeting. |

### 9.6 Alert Rules

| Rule ID | Rule |
|---|---|
| ALR-01 | Alerts follow a mandatory lifecycle: OPEN → ACKNOWLEDGED → ASSIGNED → CLOSED. |
| ALR-02 | Closing an alert requires a non-empty resolution_note (min 10 characters). |
| ALR-03 | Only ADMIN can acknowledge and assign alerts. |
| ALR-04 | Alerts with severity=CRITICAL that are not ACKNOWLEDGED within 60 minutes generate a repeat alert. |

### 9.7 Webhook & Integration Rules

| Rule ID | Rule |
|---|---|
| INT-01 | Webhook payloads are signed with HMAC-SHA256 using the endpoint's secret. Signature is sent in `X-HarborOps-Signature` header. |
| INT-02 | Retry policy: 3 attempts with exponential backoff (1 min, 3 min, 6 min). Total window ≤ 10 minutes. |
| INT-03 | Each webhook delivery has a unique idempotency_key (UUID). Receivers should deduplicate on this key. |
| INT-04 | A delivery is considered successful if the receiver returns HTTP 2xx within 10 seconds. |
| INT-05 | After 3 failed attempts, the delivery is marked FAILED and an alert is created. |
| INT-06 | Webhook endpoints are restricted to private/local network URLs (RFC 1918 ranges or localhost). |

### 9.8 General Rules

| Rule ID | Rule |
|---|---|
| GEN-01 | All list endpoints use cursor-based pagination with a default page size of 25 and maximum of 100. |
| GEN-02 | All timestamps returned by the API are in ISO 8601 UTC format. |
| GEN-03 | Soft-deleted records are excluded from list endpoints by default; `?include_deleted=true` is available to ADMIN only. |
| GEN-04 | Every create/update/delete operation writes an entry to the AuditLog table: (entity_type, entity_id, action, actor_id, timestamp, diff_json). |
| GEN-05 | Government ID numbers are stored encrypted (AES-256-GCM). The UI displays only the masked version (e.g., `***-**-1234`). Decryption is permitted only for ADMIN with explicit "View Sensitive" permission, and each decryption event is logged. |

---

## 10. State Machines

### 10.1 Account Status

```
[PENDING_REVIEW] ──(Admin approves)──► [ACTIVE]
[PENDING_REVIEW] ──(Admin rejects)───► [DEACTIVATED]
[ACTIVE] ────────(Admin suspends)────► [SUSPENDED]
[ACTIVE] ────────(Admin deactivates)─► [DEACTIVATED]
[SUSPENDED] ─────(Admin reactivates)─► [ACTIVE]
[SUSPENDED] ─────(Admin deactivates)─► [DEACTIVATED]
[DEACTIVATED] ───(terminal, no exits)
```

**Who can trigger:** ADMIN only. SYSTEM can trigger ACTIVE → SUSPENDED if automated policy rules are added later (documented in ASSUMPTIONS.md).

**Invalid transitions:** PENDING_REVIEW → SUSPENDED; any transition out of DEACTIVATED.

### 10.2 Recipe Version Status

```
[DRAFT] ──(Author submits)──► [ACTIVE]  (auto-supersedes prior ACTIVE)
[DRAFT] ──(Author deletes)──► (hard delete, no version created)
[ACTIVE] ─(New version activated)──► [SUPERSEDED]
[ACTIVE] ─(Admin archives)──► [ARCHIVED]
[SUPERSEDED] ──(no transitions out)
[ARCHIVED] ──(no transitions out)
```

**Who can trigger:** STAFF (author) for DRAFT→ACTIVE; SYSTEM for ACTIVE→SUPERSEDED; ADMIN for ACTIVE→ARCHIVED.

### 10.3 Menu Version Status

```
[DRAFT] ──(Staff publishes)──► [PUBLISHED]
[DRAFT] ──(Staff deletes)────► (hard delete)
[PUBLISHED] ──(Staff unpublishes)──► [UNPUBLISHED]
[PUBLISHED] ──(New version published for same site)──► [UNPUBLISHED] (auto)
[UNPUBLISHED] ──(Staff re-publishes)──► [PUBLISHED]
[UNPUBLISHED] ──(Admin archives)──► [ARCHIVED]
[ARCHIVED] ──(no transitions out)
```

**Who can trigger:** STAFF or ADMIN for manual transitions; SYSTEM for auto-unpublish.

### 10.4 Meeting Status

```
[DRAFT] ──(Organizer schedules, needs ≥1 agenda item)──► [SCHEDULED]
[SCHEDULED] ──(Organizer starts)──► [IN_PROGRESS]
[SCHEDULED] ──(Organizer cancels)──► [CANCELLED]
[IN_PROGRESS] ──(Organizer ends)──► [COMPLETED]
[IN_PROGRESS] ──(Organizer cancels)──► [CANCELLED]
[COMPLETED] ──(terminal)
[CANCELLED] ──(terminal)
```

### 10.5 Task Status

```
[TODO] ──(Assignee starts)──► [IN_PROGRESS]
[TODO] ──(System overdue check)──► [OVERDUE]
[TODO] ──(Admin/Assignee cancels)──► [CANCELLED]
[IN_PROGRESS] ──(Assignee completes)──► [DONE]
[IN_PROGRESS] ──(System overdue check)──► [OVERDUE]
[IN_PROGRESS] ──(Admin/Assignee cancels)──► [CANCELLED]
[OVERDUE] ──(Assignee starts/completes)──► [IN_PROGRESS] or [DONE]
[OVERDUE] ──(Admin/Assignee cancels)──► [CANCELLED]
[DONE] ──(terminal)
[CANCELLED] ──(terminal)
```

### 10.6 Alert Status

```
[OPEN] ──(Admin acknowledges)──► [ACKNOWLEDGED]
[ACKNOWLEDGED] ──(Admin assigns)──► [ASSIGNED]
[ASSIGNED] ──(Assignee closes with resolution_note)──► [CLOSED]
```

**Invalid:** Skipping states (OPEN→ASSIGNED, OPEN→CLOSED). All transitions require the prior state.

---

## 11. Permissions Model

### 11.1 Permission Matrix

| Resource | Action | ADMIN | STAFF | COURIER |
|---|---|---|---|---|
| User accounts | Create/Approve/Suspend/Deactivate | ✅ | ❌ | ❌ |
| User accounts | View own profile | ✅ | ✅ | ✅ |
| Tenant/Site config | CRUD | ✅ | ❌ | ❌ |
| Assets | Create/Edit/Import/Export | ✅ | ✅ (own sites) | ❌ |
| Assets | View | ✅ | ✅ (own sites) | ❌ |
| Assets | Delete (soft) | ✅ | ❌ | ❌ |
| Asset as-of timeline | View | ✅ | ✅ (own sites) | ❌ |
| Recipes | Create/Edit | ✅ | ✅ | ❌ |
| Recipes | Archive | ✅ | ❌ | ❌ |
| Dishes | Create/Edit | ✅ | ✅ | ❌ |
| Menus | Create/Edit/Publish/Unpublish | ✅ | ✅ (own sites) | ❌ |
| Menus | Archive | ✅ | ❌ | ❌ |
| Menus | Bulk release to sites | ✅ | ✅ (own sites only) | ❌ |
| Meetings | Create/Edit/Manage | ✅ | ✅ | ❌ |
| Meetings | View attendance/minutes | ✅ | ✅ (own site meetings) | ❌ |
| Tasks | Create (from resolution) | ✅ | ✅ | ❌ |
| Tasks | Update status | ✅ | ✅ (own tasks) | ❌ |
| Courier tasks | View assigned tasks | ✅ | ❌ | ✅ (own only) |
| Courier tasks | Confirm sign-in | ❌ | ❌ | ✅ (own only) |
| Alerts | View/Acknowledge/Assign | ✅ | ❌ | ❌ |
| Alerts | Close | ✅ | ✅ (if assigned) | ❌ |
| Analytics | View dashboards | ✅ | ✅ (own site) | ❌ |
| Audit logs | View | ✅ | ❌ | ❌ |
| Sensitive data (decrypt) | View unmasked gov ID | ✅ (with explicit perm) | ❌ | ❌ |
| Webhooks | CRUD | ✅ | ❌ | ❌ |

### 11.2 Field-Level Access

| Field | ADMIN | STAFF | COURIER |
|---|---|---|---|
| government_id (unmasked) | Visible on explicit action + logged | Never visible | Never visible |
| government_id (masked) | Always visible | Own profile only | Own profile only |
| password_hash | Never visible in API | Never visible | Never visible |
| encryption_key | Never visible; server config only | Never | Never |

### 11.3 Scope Rules

- STAFF sees only data from their assigned sites.
- COURIER sees only their specifically assigned pickup/drop tasks.
- ADMIN sees all data across all sites within their tenant.
- Cross-tenant data access is never permitted.

---

## 12. API / UI Contract

### 12.1 API Conventions

| Convention | Detail |
|---|---|
| Base URL | `/api/v1/` |
| Content Type | `application/json` |
| Auth | Session cookie or `Authorization: Token <token>` |
| Pagination | Cursor-based; `?cursor=<opaque>&page_size=25` |
| Sorting | `?ordering=field_name` (prefix `-` for descending) |
| Filtering | `?field=value` with documented filter fields per endpoint |
| Versioning | URL path (`/api/v1/`, `/api/v2/`); breaking changes increment version |
| Request signing | Optional HMAC header `X-HarborOps-Signature` for internal API-to-API calls |

### 12.2 Standard Response Format

**Success:**
```json
{
  "status": "success",
  "data": { ... },
  "meta": {
    "next_cursor": "abc123",
    "page_size": 25,
    "total_count": 142
  }
}
```

**Error:**
```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": [
      { "field": "asset_code", "message": "Must be 3-50 uppercase alphanumeric characters or hyphens." }
    ]
  }
}
```

### 12.3 Error Codes

| HTTP Status | Code Constant | When Used |
|---|---|---|
| 400 | BAD_REQUEST | Malformed JSON, missing required fields |
| 401 | UNAUTHORIZED | Missing or expired authentication |
| 403 | FORBIDDEN | Authenticated but lacks permission |
| 404 | NOT_FOUND | Resource does not exist or is not in user's scope |
| 409 | CONFLICT | Duplicate fingerprint, concurrent version conflict |
| 422 | VALIDATION_ERROR | Business rule violation (e.g., invalid state transition) |
| 429 | RATE_LIMITED | Too many requests (default: 100 req/min per user) |

### 12.4 Idempotency

- All POST requests that create resources accept an `Idempotency-Key` header (UUID).
- If a request with the same key was already processed, the server returns the original response with HTTP 200 (not 201).
- Idempotency keys expire after 24 hours.
- Keys are stored in a dedicated `IdempotencyRecord` table: (key, endpoint, response_status, response_body, created_at).

### 12.5 UI Interaction Expectations

- All forms perform client-side validation matching server-side rules before submission (progressive enhancement; server is authoritative).
- Bulk import shows a progress indicator and streams results as they are processed.
- Asset as-of timeline renders as a vertical timeline component with version diffs.
- Menu availability windows show a visual time-range picker.
- All destructive actions require a confirmation dialog.
- Suspended accounts see a banner: "Your account is suspended. Contact your administrator."
- Pending accounts see: "Your account is under review. You will be notified when approved."

---

## 13. Search / Dedup / Indexing

### 13.1 Asset Search

- Full-text search on asset_code, name, classification name.
- Filter by: site_id, classification_id, is_deleted, date range.
- Results ordered by relevance score (name match > code match > classification match), then by updated_at descending.
- Authorization filter: STAFF sees only assets from assigned sites; ADMIN sees all within tenant.

### 13.2 Dish/Recipe Search

- Full-text search on name, description, ingredient names.
- Filter by: allergen (include/exclude), status, effective date range.
- Results ordered by name alphabetically.

### 13.3 Deduplication (Bulk Import)

- Fingerprint: `SHA-256(site_id + '|' + lowercase(asset_code) + '|' + lowercase(name) + '|' + classification_code)`.
- Computed server-side on each import row.
- Match against existing assets in the same site.
- On match: row flagged; user chooses "Update" (creates new version) or "Skip".
- No automatic overwrite.

### 13.4 Indexing

- MySQL full-text indexes on: Asset(name, asset_code), Dish(name), Recipe(name), Meeting(title).
- Composite indexes on: (site_id, asset_code), (tenant_id, status), (menu_version_id, site_id).
- All foreign keys indexed.

---

## 14. Security & Governance

### 14.1 Authentication

- Local username + salted password (PBKDF2-SHA256, 600k iterations).
- No external auth providers.
- Session-based auth with CSRF protection for browser clients; token auth for API-to-API.

### 14.2 Password Policy

- Minimum 10 characters.
- Must contain: 1 uppercase, 1 lowercase, 1 digit, 1 special character (`!@#$%^&*()-_=+[]{}|;:',.<>?/`).
- Cannot be the same as the previous 5 passwords (stored as hashes).
- Password expiry: 90 days (configurable). Users are prompted to change on next login.

### 14.3 Account Lockout

- 5 consecutive failed attempts → locked for 15 minutes.
- Lock timer is absolute; attempts during lockout do not extend it.
- ADMIN can manually unlock an account.

### 14.4 Encryption at Rest

- Sensitive fields encrypted with AES-256-GCM.
- Encryption key stored in environment variable or local config file (not in database).
- Encrypted fields: government_id_number.
- Decryption requires ADMIN role + explicit "View Sensitive Data" permission.
- Every decryption event logged: (user_id, entity_type, entity_id, field_name, timestamp).

### 14.5 Audit Logging

- Every create, update, delete, status change, login, failed login, decryption event.
- AuditLog fields: id, tenant_id, actor_id, action, entity_type, entity_id, diff_json, ip_address, timestamp.
- Audit logs are append-only; no update or delete permitted.
- Retention: 7 years (configurable). Logs older than retention period may be archived to a separate table.

### 14.6 Data Masking & Export

- Government IDs always masked in API responses: `***-**-XXXX` (last 4 visible).
- Bulk exports of user data exclude encrypted fields entirely; only masked values appear.
- Photo ID files are not included in bulk exports.

### 14.7 Request Signing (Internal API)

- Optional HMAC-SHA256 signing for API-to-API calls within the network.
- Signature covers: HTTP method, path, timestamp, body hash.
- Timestamp must be within 5 minutes of server time; otherwise rejected.

---

## 15. Offline / Queue / Jobs

### 15.1 Queue Behavior

- Celery with local Redis broker.
- Three queues: `default` (normal priority), `bulk` (imports/exports), `webhooks`.
- Queue data persists in Redis with AOF enabled for crash recovery.

### 15.2 Scheduled Jobs

| Job | Schedule | Description |
|---|---|---|
| Task overdue check | Daily at 00:05 UTC | Transitions TODO/IN_PROGRESS tasks past due_date to OVERDUE |
| Critical alert re-notification | Every 15 minutes | Re-alerts for unacknowledged CRITICAL alerts older than 60 min |
| Session cleanup | Daily at 03:00 UTC | Removes expired sessions |
| Audit log archival | Monthly on 1st at 02:00 UTC | Archives logs older than retention period |

### 15.3 Retry Policy

- Webhook deliveries: 3 retries, exponential backoff (1 min, 3 min, 6 min).
- Bulk import jobs: no retry; failures are reported to the user for correction.
- Scheduled jobs: if a job fails, it retries once after 5 minutes; if still failing, an alert is created.

### 15.4 Idempotency

- All webhook deliveries carry an idempotency_key.
- Bulk import rows are deduplicated by fingerprint per import batch.
- Scheduled jobs use a distributed lock (Redis SETNX) to prevent concurrent execution.

### 15.5 Conflict Handling

- Concurrent edits to the same entity: optimistic concurrency via `version_number`. If the submitted version_number does not match the current, return 409 CONFLICT.
- Bulk import processes rows sequentially within a batch to avoid intra-batch conflicts.

### 15.6 Job Lifecycle

```
[PENDING] ──(Worker picks up)──► [RUNNING]
[RUNNING] ──(Completes)──► [SUCCEEDED]
[RUNNING] ──(Fails)──► [FAILED]
[FAILED] ──(Retry eligible)──► [PENDING]
[FAILED] ──(Max retries)──► [DEAD]
```

All job state transitions are logged with timestamps.

---

## 16. Reporting / Analytics

### 16.1 KPIs

| KPI | Calculation | Dimensions |
|---|---|---|
| Menu publish funnel | Count of MenuVersions by status (DRAFT → PUBLISHED) | Site, time period |
| Draft-to-published conversion rate | PUBLISHED / (DRAFT + PUBLISHED + UNPUBLISHED + ARCHIVED) × 100 | Site, month |
| Asset utilization | Count of active assets / total assets per site | Site |
| Asset exception count | Count of import rows rejected in last period | Site, time period |
| Task completion rate | DONE tasks / total tasks × 100 | Site, assignee, month |
| Overdue task count | Count of tasks with status=OVERDUE | Site, assignee |
| Meeting resolution completion | COMPLETED resolutions / total resolutions × 100 | Site, month |
| API health | Avg response time, error rate (4xx + 5xx / total) | Endpoint, hour |
| Job health | Success rate, avg duration | Job type, day |
| Alert MTTR (mean time to resolve) | AVG(closed_at - created_at) for CLOSED alerts | Severity, month |

### 16.2 Computation

- All analytics computed from local transactional tables and log tables.
- No external analytics service.
- Materialized views or summary tables refreshed by scheduled job (every 15 minutes for dashboard, daily for reports).

### 16.3 Export

- Dashboard data exportable as CSV by ADMIN.
- Reports available as PDF generated server-side (optional; markdown export as baseline).
- Exported data respects permission scope (STAFF sees own site data only).

---

## 17. Validation Rules

### 17.1 String Fields

| Field | Min | Max | Pattern |
|---|---|---|---|
| username | 3 | 150 | `^[a-zA-Z0-9._-]+$` |
| legal_first_name | 1 | 100 | Unicode letters, spaces, hyphens, apostrophes |
| legal_last_name | 1 | 100 | Same as first name |
| employee_student_id | 1 | 50 | Alphanumeric + hyphens |
| asset_code | 3 | 50 | `^[A-Z0-9\-]{3,50}$` |
| asset name | 1 | 200 | Any printable Unicode |
| dish name | 1 | 200 | Any printable Unicode |
| recipe name | 1 | 200 | Any printable Unicode |
| menu name | 1 | 200 | Any printable Unicode |
| meeting title | 1 | 300 | Any printable Unicode |

### 17.2 Numeric Fields

| Field | Min | Max | Precision |
|---|---|---|---|
| ingredient quantity | 0.0001 | 99999.9999 | 4 decimal places |
| unit_cost | 0.0000 | 99999.9999 | 4 decimal places |
| per_serving_cost | 0.00 | 999999.99 | 2 decimal places |
| price_multiplier | 0.01 | 99.99 | 2 decimal places |
| calories | 0.00 | 99999.99 | 2 decimal places |
| portion serving_size_qty | 0.01 | 9999.99 | 2 decimal places |

### 17.3 File Uploads

| Context | Allowed Types | Max Size |
|---|---|---|
| Photo ID | JPEG, PNG, PDF | 10 MB |
| Agenda attachment | PDF, DOCX, XLSX, PPTX, PNG, JPG | 20 MB |
| Bulk import | XLSX, CSV | 25 MB |
| Total attachments per meeting | — | 10 files |

### 17.4 Enum Values

| Field | Allowed Values |
|---|---|
| user.role | ADMIN, STAFF, COURIER |
| user.status | PENDING_REVIEW, ACTIVE, SUSPENDED, DEACTIVATED |
| recipe_version.status | DRAFT, ACTIVE, SUPERSEDED, ARCHIVED |
| menu_version.status | DRAFT, PUBLISHED, UNPUBLISHED, ARCHIVED |
| meeting.status | DRAFT, SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED |
| task.status | TODO, IN_PROGRESS, DONE, OVERDUE, CANCELLED |
| alert.status | OPEN, ACKNOWLEDGED, ASSIGNED, CLOSED |
| alert.severity | INFO, WARNING, CRITICAL |
| ingredient.unit | oz, lb, cup, tbsp, tsp, fl_oz, gal, qt, pt, each, pinch |
| change_source | MANUAL, BULK_IMPORT, CORRECTION |

### 17.5 Uniqueness Constraints

| Constraint | Scope |
|---|---|
| username | Per tenant |
| employee_student_id | Per tenant |
| asset_code | Per site |
| idempotency_key | Global |
| (menu_version_id, site_id) | MenuSiteRelease |

---

## 18. Non-Functional Requirements

### 18.1 Offline Behavior

- Full functionality without internet. All services run locally.
- Frontend bundle served from local Django static or local nginx.
- No external DNS resolution required.

### 18.2 Reliability

- MySQL with InnoDB; ACID transactions for all writes.
- Redis AOF persistence for queue durability.
- Database backups: configurable via cron (recommended daily full + hourly incremental).

### 18.3 Restart Recovery

- Celery workers reconnect to Redis on restart; pending tasks resume.
- In-progress bulk import jobs that were interrupted are marked FAILED; user must re-upload.
- Django application is stateless (session data in DB); any restart is transparent to users.

### 18.4 Non-Blocking Jobs

- Bulk imports run asynchronously in Celery; user receives a job ID and polls for status.
- Webhook delivery is asynchronous; never blocks the originating request.
- Analytics summary refresh runs in background; dashboard shows last-refresh timestamp.

### 18.5 Time Handling

- All internal storage in UTC.
- Each Site has a `timezone` field (IANA timezone string, e.g., "America/New_York").
- API responses include UTC timestamps; frontend converts to site timezone for display.
- Availability windows (menu groups) stored as site-local TIME values for intuitive management.

### 18.6 Performance Targets (Assumption — documented in ASSUMPTIONS.md)

- API response time: p95 < 500ms for single-entity endpoints.
- Bulk import: process 10,000 rows within 60 seconds.
- Dashboard load: < 3 seconds with pre-computed summary tables.
- Concurrent users: support up to 200 simultaneous users per deployment.

---

## 19. Phased Implementation Plan

### Phase 1: Foundation — Identity, Auth, Tenancy (Weeks 1–3)

**Scope:**
- MySQL schema for Tenant, Site, User, UserProfile, AccountStatusHistory, AuditLog.
- Django project structure with apps: `core`, `iam`, `tenants`.
- User registration (self-registration → PENDING_REVIEW).
- Onboarding form: legal name, employee/student ID, photo ID upload.
- Admin approval/rejection workflow.
- Account status state machine with full history.
- Authentication: login, logout, session management.
- Lockout policy (5 attempts / 15 min).
- Password policy enforcement.
- Encryption at rest for government ID.
- Masked display of sensitive fields.
- Role-based permission middleware.
- Audit logging for all auth and account actions.
- React app scaffold with routing, auth context, login/registration pages.
- Admin user management UI (list, approve, suspend, deactivate).
- Seed data script for initial ADMIN account.

### Phase 2: Asset Ledger (Weeks 4–6)

**Scope:**
- Schema for Asset, AssetVersion, AssetClassification.
- Asset CRUD with version snapshot on every change.
- Classification code hierarchy (3 levels max).
- Asset code validation and uniqueness.
- Bulk import engine: file parsing, server-side validation, fingerprint dedup, rejected row reporting.
- Bulk export to XLSX/CSV.
- Inline correction of rejected import rows.
- As-of timeline query and UI.
- Optimistic concurrency control.
- React UI: asset list/detail, import wizard, timeline viewer.

### Phase 3: Foodservice Production (Weeks 7–10)

**Scope:**
- Schema for Recipe, RecipeVersion, RecipeIngredient, RecipeStep, Dish, DishVersion, DishPortionSpec, DishAddon, Allergen, Menu, MenuVersion, MenuGroup, MenuGroupItem, MenuSiteRelease.
- Recipe CRUD with versioning, effective dates, step-by-step instructions.
- Server-side cost rollup calculation.
- Dish management with allergen flags, nutrition panel, portion specs, add-ons.
- One-active-version enforcement for recipes and dishes.
- Menu CRUD with groups, sorting, availability windows.
- Publish/unpublish workflow with auto-supersede.
- Bulk release to multiple sites.
- React UI: recipe editor, dish editor, menu builder with drag-and-drop grouping, time-range pickers.

### Phase 4: Meeting Workspace (Weeks 11–13)

**Scope:**
- Schema for Meeting, AgendaItem, MeetingAttendance, MeetingMinute, Resolution, Task.
- Meeting lifecycle state machine.
- Agenda collection with file attachments.
- Attendance sign-in (in-person and material-only).
- Minutes entry.
- Resolution creation and status management.
- Resolution-to-task conversion.
- Task assignment, due dates, status transitions, overdue auto-detection.
- Auditable chain from meeting → resolution → task.
- React UI: meeting dashboard, agenda builder, attendance roster, minutes editor, task board.

### Phase 5: Integration, Analytics, Polish (Weeks 14–16)

**Scope:**
- Webhook endpoint management and delivery engine with retry policy.
- Celery setup with Redis broker; queue configuration.
- Idempotency key storage and enforcement.
- Scheduled jobs: overdue task check, critical alert re-notification, session cleanup.
- Alert lifecycle (OPEN → ACKNOWLEDGED → ASSIGNED → CLOSED).
- Analytics summary tables and materialized views.
- Dashboard KPIs: menu funnel, asset utilization, task completion, API health.
- CSV export for dashboard data.
- API rate limiting.
- Request signing for internal API calls.
- React UI: webhook config, alert management, analytics dashboards.
- End-to-end integration testing.
- Performance testing against targets.

---

## 20. Phase Checkpoints

### Phase 1 Checkpoint: Foundation

**Required Artifacts:**
- Django project with `core`, `iam`, `tenants` apps.
- MySQL migrations for all Phase 1 entities.
- `ASSUMPTIONS.md` with documented decisions.
- Seed data script creating one ADMIN user.

**Required Working Flows:**
- User self-registers → appears in PENDING_REVIEW.
- ADMIN approves → user transitions to ACTIVE with history record.
- ADMIN suspends → user cannot perform writes; sees suspended banner.
- Login with correct credentials succeeds; session created.
- 5 failed logins → account locked for 15 minutes.
- Login during lockout returns generic error.

**Required Validations:**
- Password policy enforced (length, complexity).
- Username uniqueness per tenant.
- Employee/student ID uniqueness per tenant.
- Photo ID file type and size validation.
- Government ID encrypted on save, masked on read.

**Required Security Controls:**
- PBKDF2-SHA256 password hashing.
- AES-256-GCM encryption for government ID.
- CSRF protection on all mutating endpoints.
- Role-based middleware rejecting unauthorized access.
- Audit log entries for: registration, login, failed login, status change, decryption.

**Required Tests:**
- Unit tests for password policy, lockout logic, status state machine.
- Integration tests for registration → approval flow.
- API tests for auth endpoints (login, logout, session expiry).
- Permission tests: STAFF cannot access ADMIN endpoints.

**Exit Criteria:**
- All status transitions match Section 10.1 exactly.
- No raw government ID appears in any API response.
- Audit log has entries for every tested action.
- Zero test failures.

**Not Allowed to Defer:**
- Encryption at rest.
- Audit logging.
- Account lockout.
- Permission enforcement.
- Status history tracking.

---

### Phase 2 Checkpoint: Asset Ledger

**Required Artifacts:**
- Migrations for Asset, AssetVersion, AssetClassification.
- Bulk import template (XLSX + CSV).

**Required Working Flows:**
- STAFF creates asset → version 1 created.
- STAFF edits asset → version 2 created; version 1 preserved.
- STAFF uploads bulk import file → validation runs → accepted rows create versions; rejected rows returned with errors.
- STAFF corrects rejected rows inline and re-submits.
- STAFF queries as-of timeline → sees correct version for any past datetime.
- Duplicate fingerprint detected → user warned, chooses update or skip.

**Required Validations:**
- Asset code regex validation.
- Asset code uniqueness per site.
- Bulk import: required fields, format checks, 10k row limit, 25 MB limit.
- Classification hierarchy depth ≤ 3.

**Required Security Controls:**
- STAFF can only see/edit assets in assigned sites.
- COURIER cannot access asset endpoints.
- Audit log for all asset changes and imports.

**Required Tests:**
- Unit tests for fingerprint generation, deduplication logic.
- Integration tests for bulk import (happy path, validation errors, duplicates).
- API tests for as-of timeline queries.
- Permission tests for site-scoped access.

**Exit Criteria:**
- Bulk import of 10,000 rows completes within 60 seconds.
- As-of query returns correct version for 5 different historical timestamps.
- No prior version data is ever modified.

**Not Allowed to Defer:**
- Version snapshot immutability.
- Fingerprint-based deduplication.
- Site-scoped permissions.
- Audit logging for imports.

---

### Phase 3 Checkpoint: Foodservice Production

**Required Artifacts:**
- Migrations for all foodservice entities.
- Allergen reference data seed.

**Required Working Flows:**
- Create recipe with ingredients and steps → draft version.
- Activate recipe version → prior active auto-superseded; effective dates enforced.
- Create dish linked to recipe → per-serving cost auto-computed.
- Edit dish with allergens and nutrition → all-or-nothing nutrition validation.
- Create menu with groups and items → publish to site.
- Publish new menu version → old version auto-unpublished for that site.
- Bulk release menu to 3 sites → 3 independent MenuSiteRelease records.
- Availability window set to 6:00 AM–10:30 AM → validated.

**Required Validations:**
- One active recipe version at a time per recipe.
- Effective date ordering (new > current).
- Cost calculation: ROUND_HALF_UP to cents.
- Allergen mandatory declaration.
- Nutrition all-or-nothing rule.
- Menu publish requires ≥1 group with ≥1 item referencing ACTIVE dish version.
- Availability window start < end.

**Required Security Controls:**
- STAFF can only manage recipes/dishes/menus for assigned sites.
- COURIER has zero access.
- Audit log for all foodservice changes.

**Required Tests:**
- Unit tests for cost rollup calculation with known inputs.
- Unit tests for effective date enforcement.
- Integration tests for menu publish → auto-unpublish.
- Integration tests for bulk site release.
- Edge case: publish menu with dish that has DRAFT version only → rejected.

**Exit Criteria:**
- Cost rollup matches hand-calculated values for 3 test recipes.
- No two ACTIVE versions exist simultaneously for any recipe or dish.
- Menu publish/unpublish state machine matches Section 10.3.

**Not Allowed to Defer:**
- Server-side cost calculation (no client-side).
- Effective date enforcement.
- Allergen mandatory declaration.
- Version auto-supersede logic.

---

### Phase 4 Checkpoint: Meeting Workspace

**Required Artifacts:**
- Migrations for meeting entities.

**Required Working Flows:**
- Create meeting → add agenda items → schedule.
- Start meeting → record attendance → enter minutes.
- Create resolution → convert to task with assignee and due date.
- Task assignee updates status through lifecycle.
- Overdue check transitions past-due tasks.
- Chain audit: from meeting → agenda → resolution → task visible in UI.

**Required Validations:**
- Meeting requires ≥1 agenda item to schedule.
- Resolution requires meeting in IN_PROGRESS or COMPLETED.
- Task requires assignee, title, due_date.
- Attachment file type and size limits.
- Max 10 attachments per meeting.

**Required Security Controls:**
- Site-scoped meeting access for STAFF.
- COURIER cannot access meetings.
- Audit log for all meeting/resolution/task actions.

**Required Tests:**
- State machine tests for meeting lifecycle.
- State machine tests for task lifecycle.
- Integration test for resolution-to-task conversion.
- Overdue detection scheduled job test.

**Exit Criteria:**
- Full audit trail from meeting creation through task completion.
- Meeting state machine matches Section 10.4.
- Task state machine matches Section 10.5.
- Resolution auto-completes when all tasks done/cancelled.

**Not Allowed to Defer:**
- Meeting state machine enforcement.
- Task overdue auto-detection.
- Resolution ↔ task status linkage.
- Full audit chain.

---

### Phase 5 Checkpoint: Integration, Analytics, Polish

**Required Artifacts:**
- Celery configuration with 3 queues.
- Webhook delivery engine.
- Analytics summary table migrations.
- Rate limiting middleware.

**Required Working Flows:**
- Webhook fires on menu publish → delivered with signature → retry on failure → alert on exhaust.
- Idempotency key prevents duplicate resource creation.
- Alert created → acknowledged → assigned → closed with resolution note.
- Analytics dashboard shows live KPIs.
- CSV export of dashboard data.
- Critical alert re-notification fires for unacknowledged alerts.

**Required Validations:**
- Webhook URL must be private/local network.
- Alert closure requires resolution_note ≥ 10 characters.
- Idempotency key uniqueness.
- Rate limit: 100 req/min per user.

**Required Security Controls:**
- HMAC-SHA256 webhook signing.
- Request signing validation for internal API calls.
- Alert management restricted to ADMIN.

**Required Tests:**
- Webhook delivery with retry simulation (mock HTTP failures).
- Idempotency key duplicate request test.
- Alert lifecycle state machine test.
- Rate limiting test (101st request returns 429).
- Analytics computation accuracy for known test data.

**Exit Criteria:**
- Webhook retry policy matches INT-02 exactly.
- Alert lifecycle matches Section 10.6.
- All KPIs from Section 16.1 display correctly on dashboard.
- System operates fully with no external network access.

**Not Allowed to Defer:**
- Webhook signature verification.
- Idempotency enforcement.
- Alert closed-loop lifecycle.
- Rate limiting.

---

## 21. Definition of Done (STRICT)

The system is complete ONLY when ALL of the following are true:

1. **All workflows work end-to-end:** Registration → approval → login → operate → logout across all roles.
2. **State machines enforced:** Every state machine in Section 10 is implemented with server-side guards; invalid transitions return 422.
3. **Permissions enforced:** Every endpoint checks role and site scope; unauthorized access returns 403.
4. **Audit logs exist:** Every create, update, delete, login, failed login, status change, and decryption event is logged in AuditLog.
5. **Validation rules enforced:** Every rule in Section 17 is checked server-side; invalid input returns 400 or 422 with field-level detail.
6. **Retries/idempotency work:** Webhook retries match policy; idempotency keys prevent duplicates; scheduled jobs use distributed locks.
7. **No placeholder features remain:** Every feature described in this specification is implemented, not stubbed.
8. **Tests cover critical flows:** Unit tests for business logic; integration tests for workflows; API tests for permissions and error codes.
9. **Encryption at rest operational:** Government IDs encrypted; decryption logged; masked display confirmed.
10. **Offline operation verified:** System boots, authenticates, and operates all modules with no network access.
11. **Cost calculations verified:** Per-serving cost matches hand-computed values for ≥3 test recipes.
12. **Version history intact:** No AssetVersion or RecipeVersion is ever modified after creation.

---

## 22. Deliverables

| Deliverable | Description |
|---|---|
| Django Application | Complete backend with all apps, models, serializers, views, permissions, middleware |
| React Application | Complete frontend with all pages, components, routing, auth context |
| Database Migrations | Full migration chain from empty database to production schema |
| Seed Data | Script to create: initial ADMIN user, allergen reference data, sample classification codes, sample tenant/site |
| Test Suite | Unit, integration, and API tests achieving ≥80% code coverage on business logic |
| Configuration | Django settings (dev/prod), Celery config, Redis config, nginx sample config |
| Docker Compose | Local development environment: Django, MySQL, Redis, nginx |
| `ASSUMPTIONS.md` | All assumptions with ID, description, default, rationale, override instructions |
| `API_REFERENCE.md` | Endpoint catalog with request/response examples |
| `DEPLOYMENT.md` | Installation and deployment guide for on-premises setup |

---

## ASSUMPTIONS.md (Initial)

| ID | Assumption | Default | Rationale | Override |
|---|---|---|---|---|
| A-01 | Government ID format | US SSN (XXX-XX-XXXX) | Specification mentions US units; most common format | Change regex in UserProfile model |
| A-02 | Session backend | Database-backed sessions | Reliable without Redis; no external dependency | Switch to Redis sessions if performance requires |
| A-03 | Photo ID review | Manual by ADMIN only | No OCR or automated verification specified | Add automated review as future enhancement |
| A-04 | Timezone per site | Stored as IANA string; default "America/New_York" | US-oriented system | Change default in Site model |
| A-05 | DEACTIVATED is terminal | No reactivation; new account required | Strongest audit guarantee | Change to allow ADMIN reactivation if policy permits |
| A-06 | Password expiry | 90 days | Common enterprise default | Change `PASSWORD_EXPIRY_DAYS` setting |
| A-07 | API rate limit | 100 requests/minute per user | Reasonable for internal tool | Change `RATE_LIMIT_PER_MINUTE` setting |
| A-08 | Bulk import max rows | 10,000 | Balance between usability and server load | Change `BULK_IMPORT_MAX_ROWS` setting |
| A-09 | Redis required | Only if webhooks/queue/scheduled jobs are enabled | Core functionality works without Redis | Disable Celery for minimal deployment |
| A-10 | File storage path | `/var/harborops/uploads/` | Standard Linux path | Change `UPLOAD_ROOT` setting |
| A-11 | Courier task model | Courier tasks are a subset of meeting Tasks with delivery_type flag | Spec says "assigned pickup/drop tasks" without defining a separate entity | Create separate CourierTask model if needed |
| A-12 | Performance targets | p95 < 500ms, 10k import < 60s, 200 concurrent users | Reasonable for on-prem | Tune database and Celery workers |