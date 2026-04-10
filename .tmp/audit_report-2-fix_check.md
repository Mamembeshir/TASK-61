# HarborOps Previous Issues Recheck (v4)

Date: 2026-04-10  
Mode: Static-only

## Result
- Fixed: **9 / 9**
- Not fixed: **0 / 9**

## Evidence by Previous Issue

1) Idempotency replay scope  
**Fixed** — scoped by key+endpoint+actor and constrained in model.  
Evidence: `repo/backend/core/middleware.py:145`, `repo/backend/core/middleware.py:166`, `repo/backend/core/models.py:92`

2) Webhook secret exposure in API reads  
**Fixed** — `secret` is write-only, list/detail use serializer output.  
Evidence: `repo/backend/integrations/serializers.py:79`, `repo/backend/integrations/views.py:238`, `repo/backend/integrations/views.py:294`

3) Recipe active-version site scoping  
**Fixed** — site field + active uniqueness per `(recipe, site)` + activation-mode guardrails.  
Evidence: `repo/backend/foodservice/models.py:75`, `repo/backend/foodservice/models.py:108`, `repo/backend/foodservice/models.py:165`, `repo/backend/foodservice/views.py:264`

4) Encryption-at-rest default hardening  
**Fixed** — production requires env key; compose no longer injects known fallback literal.  
Evidence: `repo/backend/harborops/settings.py:200`, `repo/backend/harborops/settings.py:227`, `repo/docker-compose.yml:97`

5) Pagination consistency across list endpoints  
**Fixed** — prior unpaginated endpoints now use shared paginator.  
Evidence: `repo/backend/meetings/views.py:472`, `repo/backend/foodservice/views.py:835`, `repo/backend/tenants/admin_views.py:30`, `repo/backend/tenants/admin_views.py:84`, `repo/backend/meetings/courier_views.py:61`, `repo/backend/assets/views.py:303`, `repo/backend/integrations/views.py:238`

6) Health endpoint leaking internal exception text  
**Fixed** — generic health payload, exception detail only logged server-side.  
Evidence: `repo/backend/core/views.py:45`, `repo/backend/core/views.py:64`

7) Photo ID optional in onboarding  
**Fixed** — backend requires file and frontend marks required upload.  
Evidence: `repo/backend/iam/serializers.py:85`, `repo/frontend/src/pages/auth/RegisterPage.tsx:255`

8) Missing signed-request negative tests  
**Fixed** — explicit tests for missing headers, timestamp expiry, invalid signature, nonce replay.  
Evidence: `repo/backend/tests/unit/core/test_middleware.py:464`, `repo/backend/tests/unit/core/test_middleware.py:492`, `repo/backend/tests/unit/core/test_middleware.py:517`, `repo/backend/tests/unit/core/test_middleware.py:545`

9) README/requirements Django version mismatch  
**Fixed** — README now matches Django 5 dependency pin.  
Evidence: `repo/README.md:164`, `repo/backend/requirements.txt:7`
