"""
tests/signed_client.py

Shared DRF test client that automatically adds signed-request headers
(X-Request-Timestamp, X-Request-Nonce, X-Request-Signature) for Token-
authenticated requests, satisfying SignedRequestMiddleware in tests.
"""
import hashlib
import hmac as hmac_lib
import time
import uuid

from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token


class SignedAPIClient(APIClient):
    """
    DRF APIClient that automatically adds signed-request headers for
    Token-authenticated requests, satisfying SignedRequestMiddleware.
    """

    _token_key: "str | None" = None

    def credentials(self, **kwargs):
        auth = kwargs.get("HTTP_AUTHORIZATION", "")
        if auth.startswith("Token "):
            self._token_key = auth[6:].strip()
        super().credentials(**kwargs)

    def _sign(self, method: str, path: str) -> dict:
        if not self._token_key:
            return {}
        # Strip query string — middleware uses request.path (no query string)
        clean_path = path.split("?")[0]
        timestamp  = str(int(time.time()))
        nonce      = str(uuid.uuid4())
        message    = f"{method.upper()}\n{clean_path}\n{timestamp}\n{nonce}".encode()
        signature  = hmac_lib.new(
            self._token_key.encode(), message, hashlib.sha256
        ).hexdigest()
        return {
            "HTTP_X_REQUEST_TIMESTAMP": timestamp,
            "HTTP_X_REQUEST_NONCE":     nonce,
            "HTTP_X_REQUEST_SIGNATURE": signature,
        }

    def get(self, path, data=None, **extra):
        return super().get(path, data, **{**self._sign("GET", path), **extra})

    def post(self, path, data=None, format=None, content_type=None, **extra):
        return super().post(
            path, data, format=format, content_type=content_type,
            **{**self._sign("POST", path), **extra},
        )

    def patch(self, path, data=None, format=None, content_type=None, **extra):
        return super().patch(
            path, data, format=format, content_type=content_type,
            **{**self._sign("PATCH", path), **extra},
        )

    def put(self, path, data=None, format=None, content_type=None, **extra):
        return super().put(
            path, data, format=format, content_type=content_type,
            **{**self._sign("PUT", path), **extra},
        )

    def delete(self, path, data=None, **extra):
        return super().delete(path, data, **{**self._sign("DELETE", path), **extra})


def make_signed_client(user) -> SignedAPIClient:
    """Create a SignedAPIClient authenticated as the given user."""
    token, _ = Token.objects.get_or_create(user=user)
    client = SignedAPIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client
