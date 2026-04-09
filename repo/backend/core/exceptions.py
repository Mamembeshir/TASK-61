"""
core/exceptions.py

Centralised exception handler + reusable APIException subclasses.

Response shape for all errors:
    {
        "error": {
            "code": "conflict",
            "message": "Human-readable summary",
            "detail": { ... field-level errors or null ... }
        }
    }
"""
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler
from rest_framework.response import Response


# ---------------------------------------------------------------------------
# Custom exception classes
# ---------------------------------------------------------------------------

class ConflictError(APIException):
    """HTTP 409 — resource already exists."""
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Resource conflict."
    default_code = "conflict"


class UnprocessableEntity(APIException):
    """HTTP 422 — request is well-formed but fails semantic validation."""
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_detail = "Unprocessable entity."
    default_code = "unprocessable"


# ---------------------------------------------------------------------------
# Custom exception handler
# ---------------------------------------------------------------------------

def harborops_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None:
        return None

    error_code = _status_to_code(response.status_code, exc)
    detail = response.data

    # Normalise DRF's various detail shapes
    if isinstance(detail, dict) and "detail" in detail and len(detail) == 1:
        message = str(detail["detail"])
        field_errors = None
    elif isinstance(detail, dict):
        message = "Validation failed."
        field_errors = detail
    elif isinstance(detail, list):
        message = str(detail[0]) if detail else "An error occurred."
        field_errors = detail
    else:
        message = str(detail)
        field_errors = None

    response.data = {
        "error": {
            "code": error_code,
            "message": message,
            "detail": field_errors,
        }
    }
    return response


def _status_to_code(status_code: int, exc) -> str:
    mapping = {
        400: "bad_request",
        401: "unauthenticated",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        422: "unprocessable",
        429: "rate_limited",
        500: "server_error",
    }
    return mapping.get(status_code, f"http_{status_code}")
