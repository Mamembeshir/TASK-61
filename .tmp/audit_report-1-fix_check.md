# HarborOps Prior-Issues Recheck (Static-Only)

Date: 2026-04-10
Scope: Re-verified only the previously reported issue set, using static code inspection.

## Overall Result
- Previously reported issues reviewed: 6
- Fully fixed: 6
- Partially fixed: 0
- Not fixed: 0

## Issue-by-Issue Status

1) **Signed request anti-tampering not implemented**
- **Status:** Fixed
- **Evidence:** Signed-request middleware is present and registered (`backend/core/middleware.py:308`, `backend/harborops/settings.py:61`), frontend now sends `X-Request-Timestamp` / `X-Request-Nonce` / `X-Request-Signature` on token-authenticated calls (`frontend/src/api/client.ts:73`, `frontend/src/api/client.ts:78`).
- **Notes:** Test clients were updated to auto-sign API requests (`backend/tests/signed_client.py:17`, `backend/tests/api/conftest.py:46`).

2) **Tenant management endpoints missing**
- **Status:** Fixed
- **Evidence:** Admin tenant routes now exist (`backend/harborops/api_v1_urls.py:10`, `backend/tenants/admin_urls.py:10`), with CRUD-like tenant/site management views (`backend/tenants/admin_views.py:20`, `backend/tenants/admin_views.py:73`).

3) **Meeting attachment filename traversal risk**
- **Status:** Fixed
- **Evidence:** Upload helper now rejects slashes, null bytes, empty names, validates extension, and stores UUID-based server filename (`backend/meetings/views.py:128`, `backend/meetings/views.py:136`, `backend/meetings/views.py:158`).
- **Tests added:** filename/path sanitization unit tests (`backend/tests/unit/meetings/test_attachment_sanitization.py:46`, `backend/tests/unit/meetings/test_attachment_sanitization.py:89`).

4) **README references missing docs**
- **Status:** Fixed
- **Evidence:** README architecture section no longer references missing `docs/*` files; it now points to inline code comments/docstrings (`README.md:164`, `README.md:165`).

5) **Missing tests for cross-tenant menu-binding invariants**
- **Status:** Fixed
- **Evidence:** API tests now explicitly assert rejection of foreign-tenant dish versions and publish sites (`backend/tests/api/foodservice/test_menus.py:544`, `backend/tests/api/foodservice/test_menus.py:591`).

6) **Logging policy/configuration implicit**
- **Status:** Fixed
- **Evidence:** Explicit Django `LOGGING` config is defined with filters/handlers/formatters/logger levels and sensitive-field policy comments (`backend/harborops/settings.py:237`, `backend/harborops/settings.py:255`).

## Final Recheck Conclusion
- All six previously reported issues appear resolved by static evidence.
- This conclusion is static-only; runtime behavior and operational characteristics remain manual-verification scope.
