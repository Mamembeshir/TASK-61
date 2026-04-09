"""
tests/api/conftest.py

Fixtures for API integration tests:
  - `api_client`           — unauthenticated DRF APIClient
  - `auth_client(user)`    — factory that returns an APIClient pre-authenticated
                             for a given user (session + CSRF handled)
  - `admin_client`         — APIClient authenticated as the default admin_user
  - `staff_client`         — APIClient authenticated as the default staff_user
  - `courier_client`       — APIClient authenticated as the default courier_user

All tests in this subtree run inside a transaction that is rolled back after
each test (django_db with transaction=False), giving real DB semantics without
persistent state between tests.
"""
import pytest
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token


# ---------------------------------------------------------------------------
# Mark everything under tests/api/ as api + django_db
# ---------------------------------------------------------------------------
pytestmark = [
    pytest.mark.api,
    pytest.mark.django_db,
]


# ---------------------------------------------------------------------------
# Core client fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client() -> APIClient:
    """Unauthenticated DRF API client."""
    return APIClient()


@pytest.fixture
def auth_client():
    """
    Factory fixture.  Call it with a User instance to get an authenticated
    APIClient using DRF Token auth.

    Usage in a test:
        def test_something(auth_client, staff_user):
            client = auth_client(staff_user)
            resp = client.get("/api/v1/assets/")
    """
    def _make_client(user) -> APIClient:
        token, _ = Token.objects.get_or_create(user=user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return client

    return _make_client


@pytest.fixture
def admin_client(auth_client, admin_user) -> APIClient:
    """Pre-authenticated client for the default admin_user."""
    return auth_client(admin_user)


@pytest.fixture
def staff_client(auth_client, staff_user) -> APIClient:
    """Pre-authenticated client for the default staff_user."""
    return auth_client(staff_user)


@pytest.fixture
def courier_client(auth_client, courier_user) -> APIClient:
    """Pre-authenticated client for the default courier_user."""
    return auth_client(courier_user)


# ---------------------------------------------------------------------------
# Helpers available to all API tests
# ---------------------------------------------------------------------------

@pytest.fixture
def assert_status():
    """
    Tiny assertion helper that prints the response body on failure so you
    don't have to add a print() every time.

    Usage:
        def test_login(api_client, assert_status):
            resp = api_client.post("/api/v1/auth/login/", {...})
            assert_status(resp, 200)
    """
    def _assert(response, expected_status: int):
        assert response.status_code == expected_status, (
            f"Expected HTTP {expected_status}, got {response.status_code}.\n"
            f"Response body: {getattr(response, 'data', response.content)}"
        )

    return _assert
