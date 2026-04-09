"""
HarborOps Django settings.
All secrets and deployment-specific values come from environment variables.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "change-me-in-production")
DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost 127.0.0.1").split()

# ---------------------------------------------------------------------------
# Application definition
# ---------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "django_celery_results",
    "django_celery_beat",
]

LOCAL_APPS = [
    "core.apps.CoreConfig",
    "iam.apps.IamConfig",
    "tenants.apps.TenantsConfig",
    "assets.apps.AssetsConfig",
    "foodservice.apps.FoodserviceConfig",
    "meetings.apps.MeetingsConfig",
    "analytics.apps.AnalyticsConfig",
    "integrations.apps.IntegrationsConfig",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "core.middleware.AccountStatusMiddleware",
    "core.middleware.IdempotencyMiddleware",
    "core.middleware.TenantMiddleware",
    "core.middleware.RequestLoggingMiddleware",
]

ROOT_URLCONF = "harborops.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "harborops.wsgi.application"
ASGI_APPLICATION = "harborops.asgi.application"

# ---------------------------------------------------------------------------
# Database — MySQL
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.environ.get("DB_NAME", "harborops"),
        "USER": os.environ.get("DB_USER", "harborops"),
        "PASSWORD": os.environ.get("DB_PASSWORD", "harborops"),
        "HOST": os.environ.get("DB_HOST", "127.0.0.1"),
        "PORT": os.environ.get("DB_PORT", "3306"),
        "OPTIONS": {
            "charset": "utf8mb4",
            "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
        },
    }
}

# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
AUTH_USER_MODEL = "iam.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

AUTHENTICATION_BACKENDS = [
    "iam.backends.HarborOpsAuthBackend",
]

# Account lockout (configurable)
LOGIN_MAX_ATTEMPTS = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "5"))
LOGIN_LOCKOUT_MINUTES = int(os.environ.get("LOGIN_LOCKOUT_MINUTES", "15"))

# Session
SESSION_ENGINE = "django.contrib.sessions.backends.db"
SESSION_COOKIE_AGE = int(os.environ.get("SESSION_COOKIE_AGE", str(8 * 3600)))  # 8 hours
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_SAVE_EVERY_REQUEST = True

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "core.pagination.CursorPagination",
    "PAGE_SIZE": 25,
    "MAX_PAGE_SIZE": 100,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_VERSIONING_CLASS": "rest_framework.versioning.URLPathVersioning",
    "DEFAULT_VERSION": "v1",
    "ALLOWED_VERSIONS": ["v1"],
    "EXCEPTION_HANDLER": "core.exceptions.harborops_exception_handler",
}

# ---------------------------------------------------------------------------
# CORS (allow React dev server in development)
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5173 http://127.0.0.1:5173"
).split()
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# Internationalisation
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

SITE_TIMEZONE_DEFAULT = os.environ.get("SITE_TIMEZONE_DEFAULT", "America/New_York")

# ---------------------------------------------------------------------------
# Static & Media files
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Only include the extra static dir if it actually exists (avoids collectstatic errors)
_extra_static = BASE_DIR / "static"
STATICFILES_DIRS = [_extra_static] if _extra_static.exists() else []

MEDIA_URL = "/media/"
UPLOAD_ROOT = Path(os.environ.get("UPLOAD_ROOT", "/var/harborops/uploads/"))
MEDIA_ROOT = UPLOAD_ROOT

# File upload limits
DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.environ.get("MAX_UPLOAD_MB", "25")) * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = DATA_UPLOAD_MAX_MEMORY_SIZE

# ---------------------------------------------------------------------------
# Encryption
# ---------------------------------------------------------------------------
# AES-256-GCM key — must be a 32-byte URL-safe base64-encoded string in production.
# The default below is for development ONLY. Override via env var in any real deployment.
_DEV_ENCRYPTION_KEY = "GfnFkVsAox_R0gEo8qkzqXF_nscikghFSs9pIyF8ZEw="
FIELD_ENCRYPTION_KEY = os.environ.get("FIELD_ENCRYPTION_KEY", _DEV_ENCRYPTION_KEY)

# ---------------------------------------------------------------------------
# Celery
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = "django-db"
CELERY_CACHE_BACKEND = "django-cache"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
# Retry policy defaults (used by integrations app)
WEBHOOK_MAX_RETRIES = int(os.environ.get("WEBHOOK_MAX_RETRIES", "3"))
WEBHOOK_RETRY_COUNTDOWN_SECONDS = int(os.environ.get("WEBHOOK_RETRY_COUNTDOWN_SECONDS", "200"))  # ~3 min

# ---------------------------------------------------------------------------
# Bulk import limits
# ---------------------------------------------------------------------------
BULK_IMPORT_MAX_FILE_MB = int(os.environ.get("BULK_IMPORT_MAX_FILE_MB", "25"))
BULK_IMPORT_MAX_ROWS = int(os.environ.get("BULK_IMPORT_MAX_ROWS", "10000"))

# ---------------------------------------------------------------------------
# Password history
# ---------------------------------------------------------------------------
PASSWORD_HISTORY_COUNT = int(os.environ.get("PASSWORD_HISTORY_COUNT", "5"))
PASSWORD_EXPIRY_DAYS = int(os.environ.get("PASSWORD_EXPIRY_DAYS", "90"))

# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
ANALYTICS_REFRESH_MINUTES = int(os.environ.get("ANALYTICS_REFRESH_MINUTES", "15"))
AUDIT_LOG_RETENTION_YEARS = int(os.environ.get("AUDIT_LOG_RETENTION_YEARS", "7"))

# ---------------------------------------------------------------------------
# Default primary key field type
# ---------------------------------------------------------------------------
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
