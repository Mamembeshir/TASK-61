# Test Coverage Audit

## Scope and Project Type Detection
- Static inspection only (no test execution, no runtime assumptions).
- README does not explicitly declare one of `backend|fullstack|web|android|ios|desktop` at top.
- Inferred project type: **fullstack** (evidence: `backend/`, `frontend/`, `docker-compose.yml`, `README.md:32-37`).

## Backend Endpoint Inventory
- Resolved base prefix chain: `backend/harborops/urls.py:14` -> `backend/harborops/api_v1_urls.py:7-20`.
- Total unique endpoints (`METHOD + resolved PATH`): **102**.

## API Test Mapping Table (all endpoints)
Legend: `TNM` = true no-mock HTTP; `HWM` = HTTP with mocking; `NONE` = no HTTP test found.

| Endpoint | Covered | Test type | Test files | Evidence |
|---|---|---|---|---|
| GET `/api/v1/core/health/` | yes | TNM | `backend/tests/api/core/test_core.py` | `TestHealthCheck.test_health_check_returns_200` |
| GET `/api/v1/core/audit-log/` | yes | TNM | `backend/tests/api/core/test_core.py` | `TestAuditLogView.test_admin_can_access` |
| POST `/api/v1/auth/register/` | yes | TNM | `backend/tests/api/iam/test_auth.py` | `TestRegister.test_happy_path_returns_201_pending_review` |
| POST `/api/v1/auth/login/` | yes | TNM | `backend/tests/api/iam/test_auth.py` | `TestLogin.test_happy_path_returns_200_with_token_and_profile` |
| POST `/api/v1/auth/logout/` | yes | TNM | `backend/tests/api/iam/test_auth.py` | `TestLogout.test_authenticated_user_can_logout_returns_200` |
| GET `/api/v1/auth/me/` | yes | TNM | `backend/tests/api/iam/test_auth.py` | `TestMe.test_returns_current_user_profile` |
| GET `/api/v1/admin/users/` | yes | TNM | `backend/tests/api/iam/test_admin.py` | `TestAdminAccess.test_admin_can_list_users` |
| POST `/api/v1/admin/users/create-courier/` | yes | TNM | `backend/tests/api/iam/test_admin.py` | `TestCreateCourier.test_create_courier_returns_201_active` |
| GET `/api/v1/admin/users/:user_id/` | yes | TNM | `backend/tests/api/iam/test_admin.py` | `TestUserDetail.test_admin_can_retrieve_user_detail` |
| POST `/api/v1/admin/users/:user_id/transition/` | yes | TNM | `backend/tests/api/iam/test_admin.py` | `TestStatusTransitions.test_suspend_active_user` |
| POST `/api/v1/admin/users/:user_id/review-photo/` | yes | TNM | `backend/tests/api/iam/test_admin.py` | `TestReviewPhoto.test_admin_can_approve_photo` |
| POST `/api/v1/admin/users/:user_id/assign-role/` | yes | TNM | `backend/tests/api/iam/test_admin.py` | `TestRoleAssignment.test_assign_courier_role` |
| POST `/api/v1/admin/users/:user_id/unlock/` | yes | TNM | `backend/tests/api/iam/test_admin.py` | `TestUnlock.test_unlock_clears_lockout` |
| GET `/api/v1/admin/sites/` | yes | TNM | `backend/tests/api/iam/test_admin.py` | `TestAdminSitesList.test_admin_can_list_active_sites` |
| GET `/api/v1/admin/tenants/` | yes | TNM | `backend/tests/api/tenants/test_admin_tenants.py` | `TestTenantList.test_superuser_can_list_tenants` |
| POST `/api/v1/admin/tenants/` | yes | TNM | `backend/tests/api/tenants/test_admin_tenants.py` | `TestTenantCreate.test_superuser_can_create_tenant` |
| GET `/api/v1/admin/tenants/:pk/` | yes | TNM | `backend/tests/api/tenants/test_admin_tenants.py` | `TestTenantDetail.test_superuser_can_retrieve_tenant` |
| PATCH `/api/v1/admin/tenants/:pk/` | yes | TNM | `backend/tests/api/tenants/test_admin_tenants.py` | `TestTenantUpdate.test_superuser_can_patch_tenant_name` |
| DELETE `/api/v1/admin/tenants/:pk/` | yes | TNM | `backend/tests/api/tenants/test_admin_tenants.py` | `TestTenantDelete.test_superuser_can_soft_delete_tenant` |
| GET `/api/v1/admin/tenants/:pk/sites/` | yes | TNM | `backend/tests/api/tenants/test_admin_tenants.py` | `TestTenantSiteList.test_superuser_can_list_tenant_sites` |
| POST `/api/v1/admin/tenants/:pk/sites/` | yes | TNM | `backend/tests/api/tenants/test_admin_tenants.py` | `TestTenantSiteCreate.test_superuser_can_create_site_under_tenant` |
| PATCH `/api/v1/admin/tenants/:pk/sites/:site_pk/` | yes | TNM | `backend/tests/api/tenants/test_admin_tenants.py` | `TestTenantSiteUpdate.test_superuser_can_patch_site_name` |
| DELETE `/api/v1/admin/tenants/:pk/sites/:site_pk/` | yes | TNM | `backend/tests/api/tenants/test_admin_tenants.py` | `TestTenantSiteDelete.test_superuser_can_soft_delete_site` |
| GET `/api/v1/tenants/sites/` | yes | TNM | `backend/tests/api/tenants/test_tenants.py` | `TestAdminSiteList.test_admin_sees_all_active_sites` |
| GET `/api/v1/assets/` | yes | TNM | `backend/tests/api/assets/test_assets.py` | `TestSoftDelete.test_deleted_excluded_from_default_list` |
| POST `/api/v1/assets/` | yes | TNM | `backend/tests/api/assets/test_assets.py` | `TestAssetCreate.test_create_returns_201_with_version_1` |
| GET `/api/v1/assets/:pk/` | yes | TNM | `backend/tests/api/assets/test_assets.py` | `TestStaffSiteIsolation.test_staff_assigned_site_can_see_asset` |
| PUT `/api/v1/assets/:pk/` | yes | TNM | `backend/tests/api/assets/test_assets.py` | `TestAssetUpdate.test_update_creates_version_2` |
| DELETE `/api/v1/assets/:pk/` | yes | TNM | `backend/tests/api/assets/test_assets.py` | `TestSoftDelete.test_admin_can_soft_delete` |
| GET `/api/v1/assets/:pk/timeline/` | yes | TNM | `backend/tests/api/assets/test_assets.py` | `TestTimeline.test_timeline_returns_all_versions_newest_first` |
| GET `/api/v1/assets/:pk/as-of/` | yes | TNM | `backend/tests/api/assets/test_assets.py` | `TestAsOf.test_as_of_returns_version_at_timestamp` |
| POST `/api/v1/assets/import/` | yes | TNM + HWM | `backend/tests/api/assets/test_bulk_import.py` | TNM: `TestHappyPathCSV.test_upload_returns_preview_with_5_new_rows`; HWM: `TestFileSizeLimit.test_oversized_file_returns_422` |
| GET `/api/v1/assets/import/:job_id/` | yes | TNM | `backend/tests/api/assets/test_bulk_import.py` | `TestAsyncDispatch.test_poll_endpoint_returns_job_status` |
| POST `/api/v1/assets/import/:job_id/correct/` | yes | TNM | `backend/tests/api/assets/test_bulk_import.py` | `TestCorrections.test_correct_bad_asset_code_becomes_new` |
| POST `/api/v1/assets/import/:job_id/confirm/` | yes | TNM | `backend/tests/api/assets/test_bulk_import.py` | `TestHappyPathCSV.test_confirm_creates_assets` |
| GET `/api/v1/assets/export/` | yes | TNM | `backend/tests/api/assets/test_bulk_import.py` | `TestExport.test_csv_export_contains_assets` |
| GET `/api/v1/asset-classifications/` | yes | TNM | `backend/tests/api/assets/test_assets.py` | `TestClassifications.test_list_returns_tree_structure` |
| POST `/api/v1/asset-classifications/` | yes | TNM | `backend/tests/api/assets/test_assets.py` | `TestClassifications.test_create_classification_depth_1` |
| GET `/api/v1/foodservice/allergens/` | yes | TNM | `backend/tests/api/foodservice/test_dishes.py` | `TestAllergenFiltering.test_list_all_allergens` |
| GET `/api/v1/foodservice/recipes/` | yes | TNM | `backend/tests/api/foodservice/test_recipes.py` | `TestRecipeList.test_list_returns_200` |
| POST `/api/v1/foodservice/recipes/` | yes | TNM | `backend/tests/api/foodservice/test_recipes.py` | `TestCreateRecipe.test_create_recipe_returns_201_with_draft_version` |
| GET `/api/v1/foodservice/recipes/:pk/` | yes | TNM | `backend/tests/api/foodservice/test_recipes.py` | `TestActivateVersion.test_activated_version_appears_in_recipe_detail` |
| GET `/api/v1/foodservice/recipes/:pk/versions/` | yes | TNM | `backend/tests/api/foodservice/test_recipes.py` | `TestRecipeVersionDetail.test_get_version_detail_returns_200` |
| POST `/api/v1/foodservice/recipes/:pk/versions/` | yes | TNM | `backend/tests/api/foodservice/test_recipes.py` | `TestSupersession.test_second_activation_supersedes_first` |
| GET `/api/v1/foodservice/recipes/:pk/versions/:vid/` | yes | TNM | `backend/tests/api/foodservice/test_recipes.py` | `TestRecipeVersionDetail.test_get_version_detail_returns_200` |
| DELETE `/api/v1/foodservice/recipes/:pk/versions/:vid/` | yes | TNM | `backend/tests/api/foodservice/test_recipes.py` | `TestDeleteVersion.test_delete_draft_returns_204` |
| POST `/api/v1/foodservice/recipes/:pk/versions/:vid/activate/` | yes | TNM | `backend/tests/api/foodservice/test_recipes.py` | `TestActivateVersion.test_activate_transitions_to_active` |
| POST `/api/v1/foodservice/recipes/:pk/versions/:vid/archive/` | yes | TNM | `backend/tests/api/foodservice/test_recipes.py` | `TestArchiveVersion.test_archive_active_version_returns_200` |
| GET `/api/v1/foodservice/dishes/` | yes | TNM | `backend/tests/api/foodservice/test_dishes.py` | `TestAllergenFiltering.test_exclude_peanuts` |
| POST `/api/v1/foodservice/dishes/` | yes | TNM | `backend/tests/api/foodservice/test_dishes.py` | `TestCreateDishAllergens.test_create_dish_with_milk_and_gluten` |
| GET `/api/v1/foodservice/dishes/:pk/` | yes | TNM | `backend/tests/api/foodservice/test_dishes.py` | `TestPortionsAndAddons.test_detail_endpoint_returns_portions_and_addons` |
| GET `/api/v1/foodservice/dishes/:pk/versions/` | yes | TNM | `backend/tests/api/foodservice/test_dishes.py` | `TestPortionsAndAddons.test_detail_endpoint_returns_portions_and_addons` |
| POST `/api/v1/foodservice/dishes/:pk/versions/` | yes | TNM | `backend/tests/api/foodservice/test_dishes.py` | `TestActivation.test_activate_then_supersede` |
| POST `/api/v1/foodservice/dishes/:pk/versions/:vid/activate/` | yes | TNM | `backend/tests/api/foodservice/test_dishes.py` | `TestActivation.test_activate_then_supersede` |
| GET `/api/v1/foodservice/menus/` | yes | TNM | `backend/tests/api/foodservice/test_menus.py` | `TestMenuListPagination.test_list_returns_paginated_envelope` |
| POST `/api/v1/foodservice/menus/` | yes | TNM | `backend/tests/api/foodservice/test_menus.py` | `TestCreateMenu.test_create_menu_returns_201` |
| GET `/api/v1/foodservice/menus/:pk/` | yes | TNM | `backend/tests/api/foodservice/test_menus.py` | `TestMenuDetail.test_get_menu_detail_returns_200` |
| GET `/api/v1/foodservice/menus/:pk/versions/` | yes | TNM | `backend/tests/api/foodservice/test_menus.py` | `TestMenuVersionsList.test_get_menu_versions_returns_200` |
| POST `/api/v1/foodservice/menus/:pk/versions/` | yes | TNM | `backend/tests/api/foodservice/test_menus.py` | `TestMenuVersionsList.test_versions_list_grows_after_new_version_created` |
| POST `/api/v1/foodservice/menus/:pk/versions/:vid/publish/` | yes | TNM | `backend/tests/api/foodservice/test_menus.py` | `TestPublishWorkflow.test_publish_draft_returns_200` |
| POST `/api/v1/foodservice/menus/:pk/versions/:vid/unpublish/` | yes | TNM | `backend/tests/api/foodservice/test_menus.py` | `TestUnpublishAndArchive.test_unpublish_published_returns_200` |
| POST `/api/v1/foodservice/menus/:pk/versions/:vid/archive/` | yes | TNM | `backend/tests/api/foodservice/test_menus.py` | `TestUnpublishAndArchive.test_archive_unpublished_returns_200` |
| GET `/api/v1/foodservice/sites/:site_id/active-menus/` | yes | TNM | `backend/tests/api/foodservice/test_menus.py` | `TestSiteActiveMenus.test_returns_published_menus_for_site` |
| GET `/api/v1/meetings/meetings/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestCourierAccess.test_courier_cannot_list_meetings` |
| POST `/api/v1/meetings/meetings/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingLifecycle.test_full_lifecycle` |
| GET `/api/v1/meetings/meetings/:pk/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingDetail.test_admin_can_get_meeting_detail` |
| PATCH `/api/v1/meetings/meetings/:pk/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingUpdate.test_admin_can_patch_title_on_draft_meeting` |
| DELETE `/api/v1/meetings/meetings/:pk/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingDelete.test_admin_can_delete_draft_meeting` |
| POST `/api/v1/meetings/meetings/:pk/schedule/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingLifecycle.test_full_lifecycle` |
| POST `/api/v1/meetings/meetings/:pk/start/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingLifecycle.test_full_lifecycle` |
| POST `/api/v1/meetings/meetings/:pk/complete/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingLifecycle.test_full_lifecycle` |
| POST `/api/v1/meetings/meetings/:pk/cancel/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestInvalidTransitions.test_completed_to_cancelled_returns_422` |
| GET `/api/v1/meetings/meetings/:pk/agenda/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestAgendaList.test_agenda_list_returns_200` |
| POST `/api/v1/meetings/meetings/:pk/agenda/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingLifecycle.test_full_lifecycle` |
| GET `/api/v1/meetings/meetings/:pk/agenda/:item_pk/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestAgendaItemDetail.test_get_agenda_item_detail_returns_200` |
| PATCH `/api/v1/meetings/meetings/:pk/agenda/:item_pk/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestAgendaFrozen.test_patch_agenda_item_on_inprogress_meeting_returns_422` |
| DELETE `/api/v1/meetings/meetings/:pk/agenda/:item_pk/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestAgendaFrozen.test_delete_agenda_item_on_inprogress_meeting_returns_422` |
| GET `/api/v1/meetings/meetings/:pk/attendance/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestAttendanceList.test_attendance_list_returns_200` |
| POST `/api/v1/meetings/meetings/:pk/attendance/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingLifecycle.test_full_lifecycle` |
| GET `/api/v1/meetings/meetings/:pk/minutes/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingLifecycle.test_full_lifecycle` |
| PUT `/api/v1/meetings/meetings/:pk/minutes/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingLifecycle.test_full_lifecycle` |
| GET `/api/v1/meetings/meetings/:pk/resolutions/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestResolutionList.test_resolutions_list_returns_200` |
| POST `/api/v1/meetings/meetings/:pk/resolutions/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingLifecycle.test_full_lifecycle` |
| GET `/api/v1/meetings/resolutions/:pk/` | yes | TNM | `backend/tests/api/integration/test_full_lifecycle.py` | `TestFullLifecycle.test_full_lifecycle` |
| PATCH `/api/v1/meetings/resolutions/:pk/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestResolutionPatch.test_admin_can_patch_resolution_text` |
| POST `/api/v1/meetings/resolutions/:pk/create-task/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingLifecycle.test_full_lifecycle` |
| GET `/api/v1/meetings/tasks/mine/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMyTasksView.test_staff_sees_own_task_in_mine_list` |
| PATCH `/api/v1/meetings/tasks/:pk/` | yes | TNM | `backend/tests/api/meetings/test_meetings.py` | `TestMeetingLifecycle.test_full_lifecycle` |
| GET `/api/v1/courier/tasks/` | yes | TNM | `backend/tests/api/integration/test_full_lifecycle.py` | `TestCourierFlow.test_courier_sees_and_confirms_delivery_task` |
| POST `/api/v1/courier/tasks/:pk/confirm/` | yes | TNM | `backend/tests/api/integration/test_full_lifecycle.py` | `TestCourierFlow.test_courier_sees_and_confirms_delivery_task` |
| GET `/api/v1/analytics/dashboard/` | yes | TNM | `backend/tests/api/analytics/test_analytics.py` | `TestAnalyticsDashboard.test_admin_can_get_dashboard` |
| GET `/api/v1/analytics/export/` | yes | TNM | `backend/tests/api/analytics/test_analytics.py` | `TestAnalyticsExport.test_admin_can_export_csv` |
| GET `/api/v1/integrations/alerts/` | yes | TNM | `backend/tests/api/integrations/test_integrations.py` | `TestAlertFilters.test_filter_by_status_open_returns_only_open_alerts` |
| GET `/api/v1/integrations/alerts/:pk/` | yes | TNM | `backend/tests/api/integrations/test_integrations.py` | `TestAlertDetail.test_admin_can_get_alert_detail` |
| POST `/api/v1/integrations/alerts/:pk/acknowledge/` | yes | TNM | `backend/tests/api/integrations/test_integrations.py` | `TestAlertStateMachine.test_admin_can_acknowledge_open_alert` |
| POST `/api/v1/integrations/alerts/:pk/assign/` | yes | TNM | `backend/tests/api/integrations/test_integrations.py` | `TestAlertStateMachine.test_admin_can_assign_acknowledged_alert` |
| POST `/api/v1/integrations/alerts/:pk/close/` | yes | TNM | `backend/tests/api/integrations/test_integrations.py` | `TestAlertStateMachine.test_staff_can_close_alert_assigned_to_them` |
| GET `/api/v1/integrations/webhooks/` | yes | TNM | `backend/tests/api/integrations/test_integrations.py` | `TestWebhookList.test_admin_can_list_webhooks` |
| POST `/api/v1/integrations/webhooks/` | yes | TNM | `backend/tests/api/integrations/test_integrations.py` | `TestWebhookEndpointCRUD.test_admin_can_create_webhook_with_private_url` |
| GET `/api/v1/integrations/webhooks/:pk/` | yes | TNM | `backend/tests/api/integrations/test_integrations.py` | `TestWebhookDetail.test_admin_can_get_webhook_detail` |
| PATCH `/api/v1/integrations/webhooks/:pk/` | yes | TNM | `backend/tests/api/integrations/test_integrations.py` | `TestWebhookEndpointCRUD.test_admin_can_patch_webhook` |
| DELETE `/api/v1/integrations/webhooks/:pk/` | yes | TNM | `backend/tests/api/integrations/test_integrations.py` | `TestWebhookEndpointCRUD.test_admin_can_delete_webhook` |
| GET `/api/v1/integrations/webhooks/:pk/deliveries/` | yes | TNM | `backend/tests/api/integrations/test_integrations_extended.py` | `TestWebhookDeliveryTask.test_delivery_log_endpoint_returns_deliveries` |

## API Test Classification
1) **True No-Mock HTTP**
- Core endpoint suites: `backend/tests/api/core/test_core.py`, `backend/tests/api/iam/test_auth.py`, `backend/tests/api/iam/test_admin.py`, `backend/tests/api/tenants/test_tenants.py`, `backend/tests/api/tenants/test_admin_tenants.py`, `backend/tests/api/assets/test_assets.py`, `backend/tests/api/foodservice/test_recipes.py`, `backend/tests/api/foodservice/test_dishes.py`, `backend/tests/api/foodservice/test_menus.py`, `backend/tests/api/meetings/test_meetings.py`, `backend/tests/api/analytics/test_analytics.py`, `backend/tests/api/integration/test_full_lifecycle.py` (HTTP portions), `backend/tests/api/integrations/test_integrations.py` (HTTP portions), `backend/tests/api/integrations/test_integrations_extended.py` (HTTP portions).

2) **HTTP with Mocking**
- `backend/tests/api/assets/test_bulk_import.py::TestFileSizeLimit.test_oversized_file_returns_422`.
- `backend/tests/api/assets/test_bulk_import.py::TestRowCountLimit.test_too_many_rows_returns_422`.
- `backend/tests/api/assets/test_bulk_import.py::TestAsyncDispatch.test_large_upload_dispatches_celery_task`.

3) **Non-HTTP (unit/integration without HTTP transport)**
- `backend/tests/api/analytics/test_analytics.py::TestComputeAnalytics.*`.
- `backend/tests/api/integrations/test_integrations.py::TestCreateAlertUtility.*`, `TestWebhookDispatch.*`.
- `backend/tests/api/integrations/test_integrations_extended.py::TestWebhookDeliveryTask.*` task-only methods and `TestRenotification.*`.

## Mock Detection (explicit)
- `backend/tests/api/assets/test_bulk_import.py` patches constants and async dispatch call.
- `backend/tests/api/integrations/test_integrations_extended.py` patches `urllib.request.urlopen`.

## Coverage Summary
- Total endpoints: **102**.
- Endpoints with HTTP tests: **102/102** -> **100% HTTP coverage**.
- Endpoints with true no-mock HTTP tests: **102/102** -> **100% true API coverage**.
- Uncovered endpoints: **none**.

## Unit Test Summary

### Backend Unit Tests
- Test files: `backend/tests/unit/**/*.py`.
- Modules covered: models across core domains, middleware (`backend/tests/unit/core/test_middleware.py`), attachment sanitization (`backend/tests/unit/meetings/test_attachment_sanitization.py`).
- Important backend modules not unit-tested directly: view/controller classes, permission classes, most task modules as isolated units.

### Frontend Unit Tests (STRICT)
- Frontend unit test files detected under `frontend/tests/unit/**`.
- Frameworks/tools detected: Vitest and React Testing Library.
- Covered modules: `AuthContext`, `StatusBadge`, `SearchInput`, `ConfirmDialog`, `MeetingsPage`, frontend API modules (`auth/client/assets/foodservice/meetings/integrations/analytics/admin/courier`).
- Important frontend modules not unit-tested: most page layer still uncovered (`frontend/src/pages/**` excluding `meetings/MeetingsPage.tsx`), app shell/routing (`frontend/src/App.tsx`, layout/sidebar).

**Mandatory verdict: Frontend unit tests: PRESENT**

### Cross-Layer Observation
- Both frontend and backend are tested.
- Test balance is backend-heavy; frontend tests are narrower in scope.

## API Observability Check
- Strong in most suites: explicit endpoint path/method and payload/response assertions.
- Weak pockets: some tests assert status only.

## Tests Check
- Success/failure/validation/auth/edge paths are broad.
- Integration boundary checks exist; selective mocking is localized.
- `run_tests.sh` is Docker-based -> **OK**.

## End-to-End Expectations (fullstack)
- Partial match: FE Playwright tests exist and BE lifecycle integration tests exist.
- Gap: no broad browser-level coverage for all critical backend mutations.

## Test Coverage Score (0-100)
**93/100**

## Score Rationale
- Strong endpoint and true HTTP coverage.
- Deductions for selective HTTP-with-mocking paths and limited frontend page-level unit depth.

## Key Gaps
1. Frontend unit tests do not cover most page/container logic.
2. Mocked-path API tests still exist for bulk import boundary scenarios.
3. Browser-level full user-journey coverage remains narrower than backend API depth.

## Confidence & Assumptions
- Confidence: high on endpoint inventory and mapping; medium-high on sufficiency scoring.
- Assumption: endpoint surface defined by URL declarations under `backend/*/urls*.py`.

---

# README Audit

## README Location Check
- Required file exists: `README.md` at repository root.

## Hard Gate Failures
1. **Project type declaration missing at top** (required strict marker `backend|fullstack|web|android|ios|desktop`).
2. **Required backend/fullstack startup instruction literal missing**: README documents `docker compose up --build -d` but does not include exact `docker-compose up` command.

## High Priority Issues
1. Missing explicit top-level project type declaration.
2. Missing literal `docker-compose up` instruction required by strict gate.

## Medium Priority Issues
1. Web UI verification is minimal and not a concrete user-flow walkthrough.

## Low Priority Issues
1. Security/role model explanation is present but not consolidated as a dedicated section.

## Hard Gates (pass/fail evidence)
- Formatting/readability: **PASS**.
- Startup instructions for backend/fullstack include `docker-compose up`: **FAIL** (only `docker compose up --build -d` present in `README.md:62`).
- Access method (URL + port): **PASS**.
- Verification method: **PASS**.
- Environment rules (no local runtime install requirement): **PASS**.
- Demo credentials with roles for auth: **PASS**.

## Engineering Quality
- Tech stack clarity: good.
- Architecture explanation: good high-level.
- Testing instructions: present.
- Security/roles/workflows: partially explicit.
- Presentation quality: strong.

## README Verdict
**FAIL**

Rationale: strict hard-gate failures exist (missing top-level project type declaration and missing literal `docker-compose up`).
