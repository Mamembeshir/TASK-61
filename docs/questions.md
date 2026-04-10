# HarborOps — Business Logic Questions Log

Record of all ambiguities, unclear business rules, and boundary conditions identified while analyzing the HarborOps prompt, along with hypotheses and chosen solutions.

---

## 1. Identity & Onboarding

### 1.1 What counts as a "government ID number"?

* **Question:** The prompt says "government ID numbers are stored encrypted at rest with masked display," but never specifies which government ID (SSN, passport number, driver's license, national ID).
* **My Understanding:** Since the system uses US customary units and targets US-based organizations running cafeterias (likely universities or corporate campuses), SSN (XXX-XX-XXXX) is the most likely format. However, international employees may have different formats.
* **Solution:** Store as a free-text encrypted field with no format validation. Mask display shows only the last 4 characters regardless of format (e.g., `***-**-1234` or `*****6789`). Document in ASSUMPTIONS.md that SSN is the expected primary format but the field accepts any string up to 20 characters.

### 1.2 Can a user belong to multiple tenants?

* **Question:** The prompt says "Administrators manage tenants" and users have a tenant FK, but never clarifies whether a single person could have accounts in multiple tenants.
* **My Understanding:** Multi-tenant isolation means each tenant is a completely separate namespace. A person who works for two organizations would need two separate accounts with different usernames.
* **Solution:** User is scoped to exactly one tenant via a foreign key. Username uniqueness is enforced per-tenant, not globally. No cross-tenant identity linking.

### 1.3 Who can register — is self-registration open or invite-only?

* **Question:** The prompt says "Staff can sign in with a local username and password" and "onboarding UI captures legal name, employee or student ID, and a photo ID file upload for manual review." It does not say whether registration is open to anyone who visits the URL or restricted to pre-invited users.
* **My Understanding:** Since the system requires a real employee/student ID and photo ID with manual admin review, self-registration is open but heavily gated. Anyone can submit a registration, but they cannot do anything until an admin approves.
* **Solution:** Open self-registration that always creates accounts in PENDING_REVIEW status. No invite code or pre-registration required. The admin approval step is the access gate. If a deployment wants to restrict registration further, they can put the registration page behind a VPN or network restriction (out of scope for the app itself).

### 1.4 Can an admin reject a registration, and what happens to the account?

* **Question:** The prompt says accounts go from "Pending Review" to approved, but doesn't mention a rejection flow.
* **My Understanding:** Admins need the ability to reject fraudulent or incorrect registrations. A rejected registration should not remain in PENDING_REVIEW forever.
* **Solution:** Admin can transition PENDING_REVIEW → DEACTIVATED (which serves as rejection). The status history records the reason (e.g., "Photo ID unreadable" or "Employee ID not found in records"). Since DEACTIVATED is terminal, the person must re-register with corrected information if they want access.

### 1.5 What does "photo ID file upload for manual review" mean operationally?

* **Question:** The prompt requires photo ID upload but doesn't define the review workflow. Does the admin just look at the image and click approve? Is there a checklist? Can they request a re-upload?
* **My Understanding:** The review is a simple visual inspection by an admin — they view the uploaded image and decide if it's a valid government-issued photo ID matching the legal name provided.
* **Solution:** Photo ID has its own review status (PENDING / APPROVED / REJECTED) separate from account status. Admin can approve or reject the photo. If rejected, the user's account remains PENDING_REVIEW and the user sees a message "Your photo ID was rejected. Please upload a new one." The user can re-upload, which resets photo_id_review_status to PENDING. Account approval requires photo ID to be APPROVED first.

### 1.6 Can an admin reactivate a DEACTIVATED account?

* **Question:** The prompt says the system "disables sensitive actions for any Suspended account" and shows "time-stamped status history," but never explicitly says whether deactivation is permanent.
* **My Understanding:** For the strongest audit guarantee, DEACTIVATED should be terminal. If someone needs access again, creating a new account (with a new audit trail) is safer than reactivating an old one. This prevents scenarios where a terminated employee's account is quietly reactivated months later.
* **Solution:** DEACTIVATED is a terminal state — no transitions out. The state machine enforces this. To restore access, an admin must create a new account. Document this in ASSUMPTIONS.md since some organizations may want reactivation.

---

## 2. Authentication & Security

### 2.1 Does the lockout timer reset on failed attempts during lockout?

* **Question:** The prompt says "5 failed attempts triggers a 15-minute lock" but doesn't specify what happens if someone keeps trying during the lockout period.
* **My Understanding:** The lock timer should be absolute (starts at the 5th failure), not rolling. Attempts during lockout should not extend the timer — otherwise an attacker could lock a legitimate user out indefinitely by sending one request every 14 minutes.
* **Solution:** `locked_until` is set once at the 5th failure and does not change on subsequent attempts. Login attempts during lockout return a generic "Account locked" message without revealing when the lock expires (to avoid timing attacks). The `failed_login_count` does not increment during lockout.

### 2.2 What is the session lifetime?

* **Question:** The prompt mentions session-based authentication but doesn't specify timeout or expiry.
* **My Understanding:** For an internal operations tool used during work shifts, an 8-hour inactivity timeout and 24-hour absolute lifetime is reasonable. This covers a full work day without requiring re-login mid-shift, while ensuring overnight sessions expire.
* **Solution:** Session inactivity timeout: 8 hours. Absolute session lifetime: 24 hours (even if active). Both are configurable via Django settings.

### 2.3 Should there be a password history / reuse prevention?

* **Question:** The prompt specifies "salted password hashing and configurable lockout" but does not mention password reuse or expiry policies.
* **My Understanding:** For a compliance-oriented system, preventing password reuse and enforcing periodic changes is a common requirement, even if the prompt didn't explicitly ask for it.
* **Solution:** Store the last 5 password hashes. Reject new passwords that match any of the 5 most recent. Password expiry: 90 days (configurable). Users are prompted to change on next login after expiry. Both features can be disabled via settings if not needed.

### 2.4 How does the "signed requests to prevent tampering" work exactly?

* **Question:** The prompt mentions "signed requests" for the REST API but doesn't define the signing algorithm, what is signed, or whether this is for all requests or only internal API-to-API calls.
* **My Understanding:** Signing every browser request would be impractical (the browser doesn't have a secret key). This likely refers to server-to-server API calls (e.g., webhook deliveries, or if another on-prem system calls the HarborOps API).
* **Solution:** Request signing is optional and intended for API-to-API calls only. Uses HMAC-SHA256 over (HTTP method + path + timestamp + body hash). The signature is sent in `X-HarborOps-Signature` header. Timestamp must be within ±5 minutes of server time. Browser requests use session/CSRF auth instead. Webhook deliveries always use signing.

---

## 3. Asset Ledger

### 3.1 What exactly are the "custom fields" in asset data?

* **Question:** The prompt mentions "classification and coding rules" and "prior versions of an asset record" but doesn't define what fields an asset has beyond code, name, and classification. Different asset types (HVAC, furniture, kitchen equipment) would have different attributes.
* **My Understanding:** Rather than defining a rigid schema for every asset type, the system should use a flexible data model where the core fields (code, name, classification) are structured, and additional attributes are stored as a JSON snapshot.
* **Solution:** `AssetVersion.data_snapshot` is a JSONField that stores all attributes beyond the core fields. Each classification can define an expected schema (optional JSON Schema), but validation is advisory, not blocking. This lets different sites and asset types have different fields without schema migrations.

### 3.2 What happens if a bulk import row has an asset code that exists but the fingerprint is different?

* **Question:** Deduplication uses a fingerprint of (site_id, asset_code, name, classification_code). But what if the asset_code matches an existing asset but the name or classification has changed? Is that a duplicate or an update?
* **My Understanding:** Asset code is the true unique identifier per site. If asset_code matches but other fields differ, this is an update to the existing asset, not a new asset and not a true duplicate.
* **Solution:** Two-level matching during import: (1) Exact fingerprint match → flag as DUPLICATE, user decides. (2) Asset code match but different fingerprint → flag as UPDATE_CANDIDATE, show the user what changed, let them confirm the update. (3) No asset code match → flag as NEW. This prevents both accidental duplicates and unintended overwrites.

### 3.3 What is the maximum file size and row count for bulk imports, and what happens at the boundary?

* **Question:** The prompt says "bulk imports run server-side format checks" but doesn't specify limits. Without limits, a user could upload a multi-GB file and crash the server.
* **My Understanding:** Practical limits are needed for an on-prem system with finite resources.
* **Solution:** Max file size: 25 MB. Max rows: 10,000. Both validated before processing begins. If exceeded, the import is rejected immediately with a clear error message. These are configurable via settings.

### 3.4 How does the "as-of" timeline handle bulk imports?

* **Question:** If 500 assets are created via bulk import at the same timestamp, and someone queries "as-of" that exact timestamp, should all 500 be visible?
* **My Understanding:** Yes. The as-of query returns "the state of the world at timestamp T," which includes all versions created at or before T.
* **Solution:** As-of query uses `created_at <= T` and returns the latest version per asset at that point. Bulk imports share the same `created_at` timestamp (set at the start of the batch transaction), so they all appear together in as-of results.

### 3.5 Can assets be permanently deleted, or only soft-deleted?

* **Question:** The prompt mentions "correct rejected rows inline" for imports but says nothing about deleting assets.
* **My Understanding:** For audit and compliance, permanent deletion should not be possible. Soft delete (marking as inactive) preserves the history while hiding the asset from default views.
* **Solution:** Assets use soft delete (`is_deleted = True`). Soft-deleted assets are excluded from default list queries but remain in the as-of timeline and version history. Only ADMIN can soft-delete. No hard delete endpoint exists. A final version snapshot is created noting the deletion.

---

## 4. Foodservice Production

### 4.1 What happens when a recipe's cost changes — does the linked dish's cost update automatically?

* **Question:** The prompt says "per-serving cost rollups from recipe ingredients" for dishes, but doesn't say whether this is a one-time calculation or a live link.
* **My Understanding:** The cost should be a snapshot at the time of dish version creation or recipe activation, not a live reference. Otherwise, activating a new recipe version would silently change the cost of all linked dishes, which could affect published menus.
* **Solution:** When a dish version is created or its linked recipe's version changes, the `per_serving_cost` is recomputed and stored on the DishVersion. It does not change retroactively on existing dish versions. When a new recipe version is activated, the system can flag linked dishes as "cost may be stale" — but updating the dish requires creating a new dish version explicitly.

### 4.2 Can a dish exist without a linked recipe?

* **Question:** The prompt says dishes have "portion specs and add-ons, allergen flags and nutrition panels, and per-serving cost rollups from recipe ingredients." But what about purchased items (e.g., bottled drinks, packaged snacks) that don't have a recipe?
* **My Understanding:** Not every menu item is made from scratch. The system should allow dishes without recipes, where the cost is entered manually.
* **Solution:** `Dish.recipe_id` is nullable. If a recipe is linked, per_serving_cost is auto-computed from the recipe. If no recipe is linked, per_serving_cost must be manually entered on the dish version. Validation enforces that either a recipe is linked OR a manual cost is provided.

### 4.3 What does "effective date ranges" mean for recipes and menus in practice?

* **Question:** The prompt says recipes have "versioning and effective date ranges" and menus have "publish/unpublish controls." How do these interact? If a recipe's effective date range ends, does the dish disappear from the menu?
* **My Understanding:** Effective dates define when a version is considered "current." A recipe version is ACTIVE from `effective_from` until a new version supersedes it (at which point `effective_to` is set). This is metadata for auditing and planning — it doesn't automatically remove dishes from menus. Menu publish/unpublish is the operational control for visibility.
* **Solution:** Effective dates are for version management and audit trail, not for automatic menu control. A recipe version remains ACTIVE until explicitly superseded. Menu groups have availability windows (time-of-day) for operational visibility. If a menu needs to stop serving a dish, the operator unpublishes the menu or removes the item — the system does not auto-remove based on recipe effective dates.

### 4.4 How are nutrition values calculated — manual entry or computed from ingredients?

* **Question:** The prompt mentions "nutrition panels" on dishes but doesn't say whether nutrition data comes from ingredient-level nutrition data or is manually entered per dish.
* **My Understanding:** Ingredient-level nutrition databases are complex (USDA FoodData Central, etc.) and integrating one would be a significant feature. The prompt doesn't mention it. Nutrition is likely entered manually per dish version.
* **Solution:** Nutrition fields (calories, protein, carbs, fat) are manually entered on each dish version. They are optional but follow an all-or-nothing rule: if any of the four is provided, all four must be provided. No automatic computation from ingredients. If a future integration with a nutrition database is desired, it would be a separate enhancement.

### 4.5 Can a menu group have overlapping availability windows with another group in the same menu?

* **Question:** The prompt gives the example "6:00 AM–10:30 AM breakfast" for time-of-day availability, but doesn't say whether two groups in the same menu can overlap (e.g., an "All Day" group running 6 AM–9 PM alongside a "Breakfast" group running 6 AM–10:30 AM).
* **My Understanding:** Overlapping windows are valid and useful. A menu might have "All Day Drinks" alongside "Breakfast Entrees" and "Lunch Entrees" with different windows.
* **Solution:** No overlap validation between groups within the same menu. Each group independently defines its availability window. The UI displays all groups whose window includes the current time. Groups without a window set are considered available all day.

### 4.6 What does "bulk release to specific sites" mean — is it the same version or copies?

* **Question:** The prompt says menus support "bulk release to specific sites." Does this mean the same menu version is shared across sites, or are independent copies created per site?
* **My Understanding:** It's the same version released to multiple sites via a many-to-many relationship. Sites don't get copies — they reference the same MenuVersion. This is simpler and ensures consistency.
* **Solution:** `MenuSiteRelease` is a join table between MenuVersion and Site. Publishing to 3 sites creates 3 release records pointing to the same version. If a site needs a different menu, a different MenuVersion (or a different Menu entirely) is created. Each site can independently unpublish by removing its release record.

---

## 5. Meeting Workspace

### 5.1 Can anyone add agenda items, or only the meeting organizer?

* **Question:** The prompt says "agenda collection" but doesn't specify who can add items.
* **My Understanding:** The term "collection" implies gathering items from multiple participants. In a typical meeting workflow, anyone invited can propose agenda items, but the organizer controls the final agenda.
* **Solution:** Any STAFF or ADMIN user in the meeting's site(s) can submit agenda items when the meeting is in DRAFT or SCHEDULED status. The meeting creator (organizer) can reorder, edit, or remove agenda items. Once the meeting moves to IN_PROGRESS, the agenda is frozen — no new items.

### 5.2 What is "offline material distribution" for attendance?

* **Question:** The prompt mentions "offline material distribution" as part of meeting features. What does this mean technically?
* **My Understanding:** Some participants may not attend the meeting in person but need to receive the meeting materials (agenda, attachments). "Offline material distribution" means marking someone as having received the materials without being physically present. It's an attendance type, not a file distribution mechanism.
* **Solution:** Attendance has two methods: IN_PERSON (attended the meeting) and MATERIAL_ONLY (received materials but did not attend). Both create an attendance record with a timestamp. The system does not handle physical distribution of materials — it only records who was marked as having received them.

### 5.3 What's the relationship between resolutions and agenda items?

* **Question:** The prompt says meetings have "minutes and resolutions" and "converting resolutions into assigned tasks." But it doesn't clarify whether resolutions must be linked to specific agenda items or can be general.
* **My Understanding:** Resolutions often arise from specific agenda items (e.g., "Agenda Item 3: Budget review → Resolution: Approve $50k for kitchen renovation"). But some resolutions may be general or span multiple items.
* **Solution:** Resolution has an optional FK to AgendaItem. If linked, the UI shows the resolution under that agenda item. If not linked, it appears in a "General Resolutions" section. This preserves the audit chain (meeting → agenda item → resolution → task) when applicable, without forcing it.

### 5.4 When does a resolution's status automatically update?

* **Question:** The prompt says resolutions lead to tasks with "progress status." But how does the resolution itself track completion?
* **My Understanding:** A resolution is "complete" when all its tasks are done. This should be automatic, not manual.
* **Solution:** Resolution has statuses: OPEN, IN_PROGRESS, COMPLETED, CANCELLED. When a task is created under a resolution, the resolution moves to IN_PROGRESS. Every time a task status changes, the system checks: if all tasks are DONE or CANCELLED, the resolution auto-transitions to COMPLETED. If all tasks are CANCELLED, the resolution is CANCELLED. This is computed on every task status change, not by a scheduled job.

### 5.5 Can tasks exist without a resolution (standalone tasks)?

* **Question:** The prompt describes "converting resolutions into assigned tasks" but doesn't mention standalone tasks.
* **My Understanding:** In the scope of this system, tasks are always born from meeting resolutions. This maintains the audit chain. Standalone task management (like a general to-do system) is out of scope.
* **Solution:** Tasks always have a required FK to Resolution. There is no standalone task creation endpoint. If a user needs to track something outside a meeting, they can create a meeting with a single agenda item and resolution. This may seem heavy, but it preserves the audit chain which is a core requirement.

---

## 6. Courier Role

### 6.1 What are "assigned pickup/drop tasks" for couriers?

* **Question:** The prompt says Couriers "are restricted to viewing assigned pickup/drop tasks and sign-in confirmations" but doesn't define what a pickup/drop task is or how it's created.
* **My Understanding:** Courier tasks are a subset of meeting tasks that involve physically moving something (food, documents, equipment) between locations. They're created the same way as any task (from a resolution) but flagged as delivery tasks.
* **Solution:** Add optional fields to the Task model: `delivery_type` (PICKUP/DROP/null), `pickup_location`, `drop_location`. When a task is created with a delivery_type and assigned to a COURIER user, it becomes visible in the courier's dashboard. Non-delivery tasks assigned to a courier should probably be reassigned to a STAFF user — enforce that courier users can only be assigned delivery-type tasks.

### 6.2 What does "sign-in confirmation" mean for couriers?

* **Question:** Couriers can do "sign-in confirmations" — is this confirming their own login, confirming a pickup, or something else?
* **My Understanding:** This likely means confirming that a delivery handoff occurred — the courier confirms "I picked up the items" or "I delivered the items." It's a timestamped acknowledgment.
* **Solution:** Add `confirmed_at` (nullable datetime) to Task. Couriers have a "Confirm" button on their assigned tasks that sets `confirmed_at = now()`. This serves as proof of delivery/pickup. The confirmation is a one-time action — once confirmed, it cannot be unconfirmed.

### 6.3 Can couriers be assigned to sites?

* **Question:** The prompt says couriers are "enabled only for internal delivery handoffs." Do they belong to a site like STAFF users?
* **My Understanding:** Couriers operate across sites (picking up from one, delivering to another), so strict single-site scoping doesn't make sense. But they still need some scope limitation.
* **Solution:** Couriers can be assigned to multiple sites via UserSiteAssignment, same as STAFF. They can only see tasks where the pickup or drop location is at one of their assigned sites. This prevents a courier from seeing deliveries for buildings they don't serve.

---

## 7. Alerts & Monitoring

### 7.1 What triggers an alert?

* **Question:** The prompt says "anomalies generate alerts" and mentions "job/API health" but doesn't define specific threshold conditions.
* **My Understanding:** The system needs concrete anomaly definitions, not just "anomalies generate alerts."
* **Solution:** Define these alert triggers:
  - **job_failure**: Any Celery task fails after max retries → CRITICAL alert.
  - **webhook_exhausted**: Webhook delivery fails all 3 retries → WARNING alert.
  - **api_error_spike**: API 5xx error rate exceeds 5% in a 15-minute window → WARNING alert.
  - **import_failure**: Bulk import job fails → WARNING alert.
  - **overdue_task_threshold**: A site has more than 10 overdue tasks → INFO alert.
  - **session_anomaly**: More than 50 failed logins across all accounts in 15 minutes → CRITICAL alert (possible brute force).
  - Admins can configure custom threshold alerts via settings in a future enhancement.

### 7.2 What does "acknowledged" vs "assigned" mean in the alert lifecycle?

* **Question:** The alert lifecycle is OPEN → ACKNOWLEDGED → ASSIGNED → CLOSED. Why the separate acknowledge and assign steps?
* **My Understanding:** Acknowledgment means "someone saw this and is aware." Assignment means "this specific person is responsible for fixing it." In operations, these are different: an on-call admin might acknowledge all alerts quickly, then assign them to the right people to resolve.
* **Solution:** ACKNOWLEDGED requires only an admin click (records who and when). ASSIGNED requires selecting an assignee (who may be ADMIN or STAFF). CLOSED requires the assignee to write a resolution note explaining what was done. This three-step process ensures accountability at each stage.

### 7.3 What does the "repeat alert" for unacknowledged CRITICAL alerts look like?

* **Question:** The prompt says unacknowledged CRITICAL alerts older than 60 minutes generate a "repeat alert." Is this a new alert entity or an update to the existing one?
* **My Understanding:** It should be a new alert that references the original, not a modification of the original. This keeps the audit trail clean and ensures the new alert also goes through the full lifecycle.
* **Solution:** Create a new Alert with `alert_type = "critical_re_notification"`, a message referencing the original alert ID, and severity = CRITICAL. The original alert remains in OPEN state. When the original is finally acknowledged, the re-notification alerts can be bulk-acknowledged as well.

---

## 8. Webhooks & Integration

### 8.1 What events should trigger webhooks?

* **Question:** The prompt says "optional local webhooks" can "notify other on-prem systems" but doesn't list which events are webhook-eligible.
* **My Understanding:** The most operationally relevant events for external systems are state changes in core workflows.
* **Solution:** Supported webhook event types:
  - `menu.published` — a menu version was published to a site
  - `menu.unpublished` — a menu version was unpublished
  - `asset.created` — a new asset was created
  - `asset.updated` — an asset version was created
  - `asset.imported` — a bulk import was completed (with summary counts)
  - `meeting.completed` — a meeting was marked completed
  - `task.completed` — a task was marked done
  - `alert.created` — a new alert was generated
  - `user.activated` — a user account was approved/activated

### 8.2 Why restrict webhook URLs to private networks?

* **Question:** The prompt doesn't explicitly say webhooks must target private networks, but the system is designed for offline/on-prem operation.
* **My Understanding:** Since the system is designed to run without internet, webhook endpoints should be other systems on the same local network. Allowing public URLs would fail in offline mode and could be a data exfiltration risk.
* **Solution:** Validate that webhook endpoint URLs resolve to RFC 1918 private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x) or localhost. Reject any URL that resolves to a public IP. This is enforced at webhook endpoint creation time.

### 8.3 What is the payload format for webhooks?

* **Question:** The prompt doesn't define webhook payload structure.
* **My Understanding:** Payloads should be consistent, self-describing, and include enough context for the receiver to act without calling back.
* **Solution:** Standard webhook payload:
  ```json
  {
    "event_type": "menu.published",
    "idempotency_key": "uuid",
    "timestamp": "ISO 8601 UTC",
    "tenant_id": "uuid",
    "data": { ... event-specific payload ... }
  }
  ```
  The `data` field contains the relevant entity's serialized representation (same as the API response for that entity). Payloads are signed with HMAC-SHA256 using the endpoint's secret key.

---

## 9. Data Architecture & General

### 9.1 Physical delete vs. logical delete — which entities use which?

* **Question:** The prompt doesn't specify a deletion strategy for most entities.
* **My Understanding:** For an auditable system, most entities should use logical (soft) delete. But some entities (like DRAFT versions that were never published) can be hard-deleted since they have no compliance significance.
* **Solution:**
  - **Soft delete** (add `is_deleted` flag): Assets, Users, Meetings, Webhooks
  - **Hard delete allowed**: DRAFT recipe/dish/menu versions (never activated or published), agenda items on DRAFT meetings, idempotency records older than 24 hours
  - **Never deletable**: Audit logs, AccountStatusHistory, AssetVersions (ACTIVE/SUPERSEDED/ARCHIVED), completed meetings, resolutions, tasks
  - All soft deletes create an audit log entry.

### 9.2 How does multi-tenancy affect database design — shared DB or separate schemas?

* **Question:** The prompt says "Administrators manage tenants" but doesn't specify the isolation model.
* **My Understanding:** For an on-prem system, a shared database with tenant_id foreign keys is simpler to deploy and maintain than separate schemas or databases per tenant.
* **Solution:** Shared MySQL database with `tenant_id` foreign key on all tenant-scoped tables. A middleware layer automatically filters all queries by the authenticated user's tenant_id. No cross-tenant joins are possible at the application layer. If a deployment requires stronger isolation, separate databases can be configured per tenant by overriding the database router.

### 9.3 How should the API handle time zones for availability windows?

* **Question:** Menu availability windows are "time-of-day" (e.g., 6:00 AM–10:30 AM). But are these in UTC or site-local time? If a menu is published to sites in different time zones, does "6 AM" mean 6 AM local to each site?
* **My Understanding:** Availability windows are operational — "breakfast is served from 6 AM to 10:30 AM" makes sense only in the site's local time.
* **Solution:** Availability start/end are stored as TIME values (no timezone info). They are interpreted relative to the site's configured timezone. The API returns them as bare time strings (e.g., "06:00:00"), and the frontend displays them as-is. Since a MenuVersion can be published to sites in different timezones, the same window is interpreted locally at each site.

### 9.4 What pagination strategy should the API use?

* **Question:** The prompt says "consistent pagination" but doesn't specify offset-based or cursor-based.
* **My Understanding:** Cursor-based pagination is more reliable for datasets that change frequently (new assets, import rows). Offset-based can skip or duplicate records when data changes between pages.
* **Solution:** Cursor-based pagination using an opaque encrypted cursor (based on the last record's primary key + sort field). Default page size: 25. Maximum page size: 100. Response includes `next_cursor` (null if no more pages) and `total_count` (computed once, cached for the query).

### 9.5 How should optimistic concurrency work across the system?

* **Question:** The prompt mentions "version snapshots rather than overwriting history" but doesn't define how concurrent edits are handled.
* **My Understanding:** If two users edit the same asset simultaneously, the second save should not silently overwrite the first user's changes.
* **Solution:** Every versioned entity (Asset, Recipe, Dish, Menu) uses optimistic concurrency via `version_number`. Update requests must include the current `version_number`. If the submitted version doesn't match the database, the server returns 409 CONFLICT with the current version data. The frontend then shows "This record was modified. Please reload and try again."

### 9.6 What is the audit log retention period?

* **Question:** The prompt says the system needs audit logs but doesn't specify how long they must be kept.
* **My Understanding:** Compliance-oriented systems typically require 7 years of audit log retention. But storing 7 years of logs in the primary database could affect performance.
* **Solution:** Default retention: 7 years (configurable). Logs older than the retention period are archived to a separate `AuditLogArchive` table (same schema, different table) by a monthly scheduled job. Archived logs can be queried by ADMIN via a separate endpoint but are not included in default log views.

### 9.7 What happens during a server restart with in-progress bulk imports?

* **Question:** If the server crashes or restarts while a bulk import is being processed, what happens to the partially completed import?
* **My Understanding:** Partial imports are dangerous — some rows created, some not, and the user doesn't know which. The safest approach is to treat the entire import as a transaction.
* **Solution:** Bulk imports run inside a database transaction. If the server crashes mid-import, the transaction is rolled back and no rows are created. The BulkImportJob status remains PROCESSING (since it was never updated to SUCCEEDED). On restart, a startup task checks for stale PROCESSING jobs (older than 1 hour) and marks them as FAILED. The user sees the failure and can re-upload.

---

## 10. Reporting & Analytics

### 10.1 Are analytics computed in real-time or on a schedule?

* **Question:** The prompt says "analytics and monitoring are computed from local logs and transactional tables" but doesn't say how frequently.
* **My Understanding:** Real-time computation of complex aggregations on every dashboard load would be too expensive. Scheduled precomputation is more practical.
* **Solution:** Analytics are precomputed by a Celery task every 15 minutes and stored in an `AnalyticsSummary` table. The dashboard reads from this table (fast) and shows a "Last updated: X minutes ago" timestamp. For truly urgent metrics (like active alert count), a lightweight real-time query supplements the precomputed data.

### 10.2 Who can see which analytics?

* **Question:** The prompt doesn't define analytics access control beyond "ADMIN."
* **My Understanding:** STAFF users who are kitchen leads or asset custodians would benefit from seeing analytics for their own sites, while system-wide metrics should be ADMIN-only.
* **Solution:** ADMIN sees all analytics across all sites. STAFF sees analytics filtered to their assigned sites only. COURIER sees no analytics. The API filters analytics results by the user's site assignments. Export (CSV) is ADMIN-only.

### 10.3 What constitutes "API health" metrics?

* **Question:** The prompt mentions "job/API health" monitoring but doesn't define what to measure.
* **My Understanding:** Standard API health metrics include response time, error rate, and throughput.
* **Solution:** A request logging middleware records every API request: method, path, status code, response time (ms), user ID, timestamp. Metrics computed:
  - Average response time (p50, p95) per endpoint per hour
  - Error rate: (4xx + 5xx) / total requests per hour
  - Throughput: requests per minute
  - Top 5 slowest endpoints in the last hour
  These are displayed in the analytics dashboard and used to trigger API health alerts.
---

## 11. Implementation Clarifications (added 2026-04-10)

### 11.1 MySQL vs. PostgreSQL partial unique indexes

* **Question:** The `UniqueConstraint` with `condition=Q(status="ACTIVE")` on `RecipeVersion` and `DishVersion` — is it enforced at the DB level?
* **Discovery:** MySQL 8.0 does not support partial unique indexes. The constraint definition is accepted by Django but silently not enforced by MySQL.
* **Solution:** The one-active-version invariant is enforced at the application layer via `SELECT FOR UPDATE` inside `activate()`. Tests verify the application-layer enforcement, not a DB-level IntegrityError.

### 11.2 Health check endpoint enhancement

* **Question:** Should the health check report individual subsystem status?
* **Solution:** `GET /api/v1/core/health/` now returns `{status, timestamp, database, redis}`. Returns 200 if all critical systems (database) are up, 503 if database is down. Redis failure is reported but does not change the HTTP status code (fail-open for availability).

### 11.3 Demo data seed command

* **Question:** What demo data should be available for development/staging?
* **Solution:** `python manage.py seed_demo_data` creates a complete "Coastal University" dataset: 1 tenant, 3 sites, 5 users (1 admin, 2 staff, 2 couriers), 10 assets, 3 recipes, 5 dishes, 1 published menu, 1 scheduled meeting, 2 alerts, 1 webhook endpoint.
