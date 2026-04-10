# HarborOps Static Delivery Acceptance & Architecture Audit

Date: 2026-04-10  
Mode: Static-only (no runtime execution)

## 1. Verdict
- Overall conclusion: **Partial Pass**
- Rationale: The repository is substantial and broadly aligned to the HarborOps scope, but there are material security and requirement-fit defects (including a high-risk idempotency replay/data-leak design flaw), plus notable requirement and coverage gaps.

## 2. Scope and Static Verification Boundary
- Reviewed:
  - Docs/config/run metadata: `repo/README.md:7`, `repo/.env.example:1`, `repo/docker-compose.yml:1`, `repo/backend/harborops/settings.py:1`
  - Backend entrypoints/routes/security/business modules/tests
  - Frontend routing/auth-role UI and API clients
- Not reviewed in depth:
  - Binary artifacts and generated files (e.g., `__pycache__`, `node_modules`)
  - Runtime behavior of Celery, DB locking under load, browser rendering, file serving, webhook network delivery
- Intentionally not executed:
  - Project startup, tests, Docker, migrations, external integrations
- Manual verification required for:
  - End-to-end offline operation claims
  - Real rendering/usability/accessibility and mobile behavior
  - Actual queue retry timings and webhook network interactions

## 3. Repository / Requirement Mapping Summary
- Prompt core mapped to implementation areas:
  - IAM/onboarding/status workflow: `repo/backend/iam/models.py:73`, `repo/backend/iam/views.py:60`, `repo/frontend/src/pages/auth/RegisterPage.tsx:151`
  - Assets with import/export/version timeline/as-of: `repo/backend/assets/views.py:95`, `repo/backend/assets/import_export.py:109`, `repo/frontend/src/pages/assets/AssetImportPage.tsx:32`
  - Foodservice recipes/dishes/menus: `repo/backend/foodservice/models.py:28`, `repo/backend/foodservice/views.py:627`, `repo/frontend/src/pages/kitchen/MenuBuilderPage.tsx`
  - Meetings/tasks/courier handoff: `repo/backend/meetings/views.py:173`, `repo/backend/meetings/courier_views.py:37`, `repo/frontend/src/pages/courier/CourierPage.tsx:178`
  - Integrations/alerts/webhooks: `repo/backend/integrations/views.py:95`, `repo/backend/integrations/tasks.py:26`
  - Analytics/log-derived metrics: `repo/backend/analytics/tasks.py:8`, `repo/backend/core/middleware.py:190`

## 4. Section-by-section Review

### 4.1 Hard Gates

#### 4.1.1 Documentation and static verifiability
- Conclusion: **Pass**
- Rationale: Startup/test/config instructions and environment contract are present and statically coherent.
- Evidence: `repo/README.md:7`, `repo/README.md:86`, `repo/.env.example:7`, `repo/backend/pytest.ini:1`
- Manual verification note: Runtime correctness of these instructions is not confirmed.

#### 4.1.2 Material deviation from prompt
- Conclusion: **Partial Pass**
- Rationale: Core domain areas exist, but there are material deviations: recipe active-version enforcement is not site-scoped, and API pagination is not consistently applied despite explicit prompt language.
- Evidence: `repo/backend/foodservice/models.py:28`, `repo/backend/foodservice/models.py:100`, `repo/backend/foodservice/views.py:138`, `repo/backend/meetings/views.py:199`, `repo/backend/integrations/views.py:121`

### 4.2 Delivery Completeness

#### 4.2.1 Coverage of explicit core requirements
- Conclusion: **Partial Pass**
- Rationale: Most core features are present (IAM, assets, foodservice, meetings, courier, alerts/webhooks, analytics), but key requirement mismatches remain (recipe/site effective-version semantics; consistent pagination).
- Evidence: `repo/backend/harborops/api_v1_urls.py:7`, `repo/backend/assets/views.py:122`, `repo/backend/foodservice/views.py:724`, `repo/backend/meetings/courier_views.py:67`, `repo/backend/analytics/views.py:53`

#### 4.2.2 End-to-end 0→1 deliverable shape
- Conclusion: **Pass**
- Rationale: Full multi-module backend + frontend + infra + tests + docs exists; not a snippet/demo-only drop.
- Evidence: `repo/README.md:169`, `repo/backend/harborops/urls.py:10`, `repo/frontend/src/App.tsx:165`, `repo/backend/tests/api/integration/test_full_lifecycle.py:1`

### 4.3 Engineering and Architecture Quality

#### 4.3.1 Structure and module decomposition
- Conclusion: **Pass**
- Rationale: Domain modules are separated clearly; responsibilities are generally coherent.
- Evidence: `repo/backend/harborops/settings.py:37`, `repo/backend/harborops/api_v1_urls.py:6`, `repo/README.md:171`

#### 4.3.2 Maintainability/extensibility
- Conclusion: **Partial Pass**
- Rationale: Good foundations (state machines, serializers, constraints) but with architectural debt points (duplicated authz patterns, inconsistent list pagination, and security-sensitive middleware design flaws).
- Evidence: `repo/backend/iam/models.py:32`, `repo/backend/core/middleware.py:108`, `repo/backend/foodservice/views.py:36`, `repo/backend/meetings/views.py:174`

### 4.4 Engineering Details and Professionalism

#### 4.4.1 Error handling/logging/validation/API design
- Conclusion: **Partial Pass**
- Rationale: There is centralized exception shaping and substantial validation/logging; however, sensitive internals can leak (health error details), and some sensitive credentials are exposed in API payloads.
- Evidence: `repo/backend/core/exceptions.py:43`, `repo/backend/harborops/settings.py:255`, `repo/backend/core/views.py:30`, `repo/backend/integrations/serializers.py:72`

#### 4.4.2 Product-grade organization vs demo
- Conclusion: **Pass**
- Rationale: The repo presents product-like breadth with role-based flows, admin ops, queue/alerts, and static test suites.
- Evidence: `repo/backend/harborops/api_v1_urls.py:6`, `repo/frontend/src/App.tsx:171`, `repo/backend/tests/api/`

### 4.5 Prompt Understanding and Requirement Fit

#### 4.5.1 Business-goal/constraint fit
- Conclusion: **Partial Pass**
- Rationale: Business scenario is generally understood, but compliance/security-critical details are weakened (photo ID optionality, predictable encryption defaults, idempotency replay scope risk).
- Evidence: `repo/backend/iam/serializers.py:85`, `repo/frontend/src/pages/auth/RegisterPage.tsx:255`, `repo/backend/harborops/settings.py:200`, `repo/backend/core/middleware.py:139`

### 4.6 Aesthetics (frontend/full-stack)
- Conclusion: **Cannot Confirm Statistically**
- Rationale: Static source shows substantial UI work and role-specific pages, but visual quality/render correctness/interaction polish requires manual browser review.
- Evidence: `repo/frontend/src/App.tsx:165`, `repo/frontend/src/pages/auth/LoginPage.tsx:72`, `repo/frontend/src/pages/courier/CourierPage.tsx:208`
- Manual verification note: Validate desktop/mobile rendering and interaction states manually.

## 5. Issues / Suggestions (Severity-Rated)

### Blocker / High

1) **Severity: High**  
**Title:** Idempotency cache is globally keyed and replay can cross endpoint/user/tenant boundaries  
**Conclusion:** **Fail**  
**Evidence:** `repo/backend/core/middleware.py:139`, `repo/backend/core/middleware.py:140`, `repo/backend/core/models.py:83`  
**Impact:** A reused `Idempotency-Key` can return a cached response body not scoped to request identity/path, risking data leakage and incorrect action replay semantics.  
**Minimum actionable fix:** Scope idempotency records by `(key, endpoint, actor_id/tenant_id)` and validate all dimensions on lookup before replay.

2) **Severity: High**  
**Title:** Webhook secrets are returned in normal API responses  
**Conclusion:** **Fail**  
**Evidence:** `repo/backend/integrations/serializers.py:72`, `repo/backend/integrations/views.py:237`, `repo/backend/integrations/views.py:294`  
**Impact:** Secret disclosure increases blast radius for internal endpoint compromise and violates least-privilege handling of credentials.  
**Minimum actionable fix:** Mark `secret` write-only; return masked value (or omit entirely) on list/detail/read operations.

3) **Severity: High**  
**Title:** Recipe active-version enforcement is not site-scoped as required  
**Conclusion:** **Fail**  
**Evidence:** `repo/backend/foodservice/models.py:28`, `repo/backend/foodservice/models.py:100`  
**Impact:** Cannot satisfy prompt’s “only one active version applies at a time per site” rule for recipes because recipes/versions are not modeled by site.  
**Minimum actionable fix:** Add site association (or site-release relation) to recipe applicability and enforce one active version per `(recipe, site)` at model+service layer.

4) **Severity: High**  
**Title:** Encryption-at-rest defaults are predictable/non-rotated in shipped config  
**Conclusion:** **Fail**  
**Evidence:** `repo/backend/harborops/settings.py:200`, `repo/backend/harborops/settings.py:201`, `repo/docker-compose.yml:63`  
**Impact:** Deployments that keep defaults encrypt sensitive IDs with a known key, materially weakening confidentiality guarantees.  
**Minimum actionable fix:** Remove hardcoded key defaults; require startup-time key presence and fail fast when absent/non-compliant.

### Medium

5) **Severity: Medium**  
**Title:** Prompt-required consistent pagination is not implemented across many list endpoints  
**Conclusion:** **Fail**  
**Evidence:** `repo/backend/harborops/settings.py:144`, `repo/backend/foodservice/views.py:138`, `repo/backend/meetings/views.py:199`, `repo/backend/integrations/views.py:121`, `repo/backend/tenants/views.py:39`  
**Impact:** API behavior is inconsistent and violates explicit prompt constraint; larger datasets may degrade client performance and predictability.  
**Minimum actionable fix:** Apply shared paginator uniformly to list endpoints (or explicitly document justified exceptions).

6) **Severity: Medium**  
**Title:** Health endpoint returns raw backend exception text  
**Conclusion:** **Fail**  
**Evidence:** `repo/backend/core/views.py:30`  
**Impact:** Potential infrastructure/internal detail leakage in error responses.  
**Minimum actionable fix:** Return generic health error codes/messages externally; log detailed exception server-side only.

7) **Severity: Medium**  
**Title:** Photo ID upload is optional despite compliance-oriented onboarding prompt  
**Conclusion:** **Partial Fail**  
**Evidence:** `repo/backend/iam/serializers.py:85`, `repo/frontend/src/pages/auth/RegisterPage.tsx:255`  
**Impact:** Weakens manual identity-review onboarding control expected in prompt.  
**Minimum actionable fix:** Make photo ID mandatory for applicable role onboarding, with explicit policy exceptions if needed.

8) **Severity: Medium**  
**Title:** Security-critical middleware behavior lacks direct negative-case tests (signed requests)  
**Conclusion:** **Insufficient Coverage**  
**Evidence:** `repo/backend/core/middleware.py:308`, `repo/backend/tests/api/core/test_core.py:1`, `repo/backend/tests/unit/core/test_middleware.py:1`  
**Impact:** Severe signed-request regressions could ship undetected while tests still pass.  
**Minimum actionable fix:** Add tests for missing signature headers, expired timestamp, invalid signature, nonce replay.

### Low

9) **Severity: Low**  
**Title:** Documentation version mismatch (README says Django 4, requirements pin Django 5)  
**Conclusion:** **Fail (doc consistency)**  
**Evidence:** `repo/README.md:155`, `repo/backend/requirements.txt:7`  
**Impact:** Reviewer/operator confusion during static verification.  
**Minimum actionable fix:** Align README architecture/version statements with pinned dependencies.

## 6. Security Review Summary

- Authentication entry points: **Pass**
  - Evidence: `repo/backend/iam/urls.py:5`, `repo/backend/iam/views.py:92`, `repo/backend/iam/models.py:148`
  - Notes: lockout/status checks and token issuance are present.

- Route-level authorization: **Partial Pass**
  - Evidence: `repo/backend/iam/permissions.py:21`, `repo/backend/assets/permissions.py:4`, `repo/backend/meetings/permissions.py:5`
  - Notes: broad role guards exist, but consistency differs by module and some sensitive routes rely inline role checks.

- Object-level authorization: **Partial Pass**
  - Evidence: `repo/backend/assets/views.py:208`, `repo/backend/meetings/views.py:87`, `repo/backend/integrations/views.py:134`
  - Notes: many object fetches are tenant-scoped; major exception is idempotency replay scope (not object but request-state security).

- Function-level authorization: **Partial Pass**
  - Evidence: `repo/backend/assets/views.py:262`, `repo/backend/foodservice/views.py:779`, `repo/backend/integrations/views.py:64`
  - Notes: present for admin-only actions, but pattern is not centralized uniformly.

- Tenant / user isolation: **Partial Pass**
  - Evidence: `repo/backend/iam/models.py:91`, `repo/backend/foodservice/views.py:673`, `repo/backend/tests/api/foodservice/test_menus.py:510`
  - Notes: tenant scoping is common and tested; idempotency design weakens cross-request isolation guarantees.

- Admin / internal / debug protection: **Partial Pass**
  - Evidence: `repo/backend/tenants/admin_views.py:25`, `repo/backend/core/views.py:10`
  - Notes: admin endpoints are guarded; health is intentionally public and leaks internal exception details.

## 7. Tests and Logging Review

- Unit tests: **Pass (with targeted gaps)**
  - Evidence: `repo/backend/tests/unit/iam/test_models.py:49`, `repo/backend/tests/unit/core/test_middleware.py:68`
  - Notes: core model/state-machine logic is well covered.

- API/integration tests: **Partial Pass**
  - Evidence: `repo/backend/tests/api/integration/test_full_lifecycle.py:57`, `repo/backend/tests/api/assets/test_bulk_import.py:67`, `repo/backend/tests/api/foodservice/test_menus.py:510`
  - Notes: strong domain coverage; missing direct signed-request negative tests and limited admin-tenant endpoint coverage.

- Logging categories / observability: **Pass**
  - Evidence: `repo/backend/harborops/settings.py:255`, `repo/backend/core/middleware.py:190`, `repo/backend/core/models.py:93`
  - Notes: request logs and analytics integration are present.

- Sensitive-data leakage risk in logs/responses: **Partial Pass / Risk**
  - Evidence: `repo/backend/core/log_filters.py:33`, `repo/backend/core/views.py:30`, `repo/backend/integrations/serializers.py:72`
  - Notes: filter exists, but response payloads still expose webhook secrets and health errors can leak internals.

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Unit tests exist: yes (`pytest`, `pytest-django`) — `repo/backend/pytest.ini:1`, `repo/backend/tests/unit/`
- API/integration tests exist: yes — `repo/backend/tests/api/`, `repo/backend/tests/api/integration/test_full_lifecycle.py:1`
- Frontend tests exist (Vitest): yes — `repo/frontend/package.json:11`, `repo/frontend/src/api/__tests__/auth.test.ts:1`
- Test entry points documented: yes — `repo/README.md:86`, `repo/run_tests.sh:1`

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Auth login/lockout/status gating | `repo/backend/tests/api/iam/test_auth.py:166` | lockout 5 fails + 403 checks | sufficient | none major | add malformed tenant_slug collision path tests |
| Pending/Suspended middleware restrictions | `repo/backend/tests/api/iam/test_auth.py:303`, `repo/backend/tests/unit/core/test_middleware.py:68` | 403 on writes / non-auth endpoints | basically covered | some assertions permissive in integration suite | tighten permissive assertions in full lifecycle auth edge tests |
| Asset CRUD + timeline + as-of + optimistic conflict | `repo/backend/tests/api/assets/test_assets.py:81` | 409 stale version assertion | sufficient | none major | add signed-request negative cases on these endpoints |
| Bulk import validation/corrections/async/export | `repo/backend/tests/api/assets/test_bulk_import.py:67` | async mocked dispatch; correction workflow | sufficient | none major | add deterministic dedup edge with mixed duplicate/update rows |
| Foodservice recipe/dish/menu workflows + tenant isolation | `repo/backend/tests/api/foodservice/test_recipes.py:74`, `repo/backend/tests/api/foodservice/test_menus.py:544` | cross-tenant 404/422 assertions | basically covered | per-site recipe-version semantics not tested (nor implemented) | add tests once site-scoped recipe applicability exists |
| Meetings→resolution→task chain + courier confirm | `repo/backend/tests/api/meetings/test_meetings.py:118`, `repo/backend/tests/api/integration/test_full_lifecycle.py:219` | lifecycle status transitions and confirm | basically covered | limited tests on attachment sanitization abuse breadth | add more filename/path traversal mutation cases |
| Alerts state machine + RBAC + webhooks | `repo/backend/tests/api/integrations/test_integrations.py:90`, `repo/backend/tests/api/integrations/test_integrations_extended.py:178` | OPEN→ACK→ASSIGN→CLOSE, retries | sufficient | no test for secret non-disclosure | add serializer/view test asserting secret omitted on reads |
| Signed request anti-tamper middleware | (none found) | n/a | missing | no explicit negative-path test for signature/timestamp/nonce | add dedicated tests for 400 codes (`signed_request_required`, `invalid_signature`, `timestamp_expired`, `nonce_replayed`) |
| Pagination consistency | partial indirect only | n/a | insufficient | no cross-module pagination contract tests | add contract tests for list endpoints returning uniform pagination schema |

### 8.3 Security Coverage Audit
- Authentication: **Basically covered** (login/register/logout/me and lockout tested) — `repo/backend/tests/api/iam/test_auth.py:54`
- Route authorization: **Basically covered** (role restrictions across assets/meetings/integrations) — `repo/backend/tests/api/assets/test_assets.py:58`, `repo/backend/tests/api/integrations/test_integrations.py:178`
- Object-level authorization: **Basically covered** (tenant/site scoping checks in foodservice/assets) — `repo/backend/tests/api/foodservice/test_menus.py:510`, `repo/backend/tests/api/assets/test_assets.py:271`
- Tenant/data isolation: **Basically covered** in major business modules, but **not for idempotency replay boundary** — `repo/backend/core/middleware.py:139`
- Admin/internal protection: **Partially covered** (admin user APIs covered; tenant admin endpoints coverage limited) — `repo/backend/tests/api/iam/test_admin.py:59`

### 8.4 Final Coverage Judgment
- **Partial Pass**
- Covered: core auth, primary domain workflows, key state machines, major RBAC paths.
- Uncovered/high-risk: signed-request negative paths, idempotency replay isolation behavior, credential non-disclosure regression tests, and pagination contract consistency. Severe defects could remain undetected while existing tests still pass.

## 9. Final Notes
- This report is evidence-based static analysis only; runtime success/UX quality are not asserted.
- Most architecture is product-grade, but high-priority remediation should start with idempotency replay scoping and secret exposure handling.
