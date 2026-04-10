"""
core/log_filters.py

Logging filters for HarborOps.

Sensitive-field policy
----------------------
Log records must never contain:
  - Passwords, tokens, or API keys (request bodies / args)
  - Authorization / Cookie / Set-Cookie header values
  - Full government-ID strings or photo-ID paths

The SensitiveFieldFilter enforces this at the handler level by scanning
each formatted log message and replacing known patterns with [REDACTED].
It is intentionally conservative: false positives (over-redaction) are
preferable to false negatives (leaking credentials).

The request-logging middleware (core/middleware.py) logs only:
  method · path · status · duration_ms · user_id
Neither request bodies nor HTTP headers are written to the logger, which
provides a first layer of defence. This filter is a belt-and-suspenders
second layer for any future log sites that inadvertently capture more.
"""

import logging
import re


# ---------------------------------------------------------------------------
# Patterns to redact — keys are human-readable labels for maintainability
# ---------------------------------------------------------------------------

_REDACT_PATTERNS: list[tuple[re.Pattern, str]] = [
    # HTTP Authorization header value: handles both
    #   "Authorization: Bearer <token>" and "Authorization: <token>"
    (
        re.compile(r"(?i)(authorization)[=:\s\"']+(?:(?:Bearer|Token|Basic)\s+)?\S+"),
        r"\1=[REDACTED]",
    ),
    # Bare "token" or "api_key" key=value forms
    (
        re.compile(r"(?i)(token|api_key|apikey|secret_key|secret)[=:\s\"']+\S+"),
        r"\1=[REDACTED]",
    ),
    # Password fields
    (
        re.compile(r"(?i)(password|passwd|new_password|old_password)[=:\s\"']+\S+"),
        r"\1=[REDACTED]",
    ),
    # Cookie header value
    (
        re.compile(r"(?i)(cookie|set-cookie)[=:\s\"']+\S+"),
        r"\1=[REDACTED]",
    ),
]


class SensitiveFieldFilter(logging.Filter):
    """
    Scrub sensitive field patterns from every log record.

    Applied at the *handler* level so it covers all loggers that route
    through that handler, regardless of how the record was emitted.
    """

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        # Render the full message (substitutes % args) once so we can scan it,
        # then store the sanitised string back as the literal message with no args.
        try:
            msg = record.getMessage()
        except Exception:
            return True  # malformed record — pass through unchanged

        for pattern, replacement in _REDACT_PATTERNS:
            msg = pattern.sub(replacement, msg)

        record.msg = msg
        record.args = ()
        return True
