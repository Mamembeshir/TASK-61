"""
core/encryption.py

AES-256-GCM field-level encryption for sensitive PII (government IDs, etc.).

Usage:
    from core.encryption import encrypt_field, decrypt_field, mask_value

    stored = encrypt_field("123-45-6789")      # → base64 ciphertext string
    plain  = decrypt_field(stored)             # → "123-45-6789"
    masked = mask_value("123-45-6789")         # → "***-**-6789"

The encryption key is a 32-byte URL-safe base64-encoded string read from the
FIELD_ENCRYPTION_KEY environment variable / Django setting.
"""
import base64
import os
from django.conf import settings

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    _CRYPTO_AVAILABLE = True
except ImportError:
    _CRYPTO_AVAILABLE = False


def _get_key() -> bytes:
    """Return the raw 32-byte encryption key."""
    raw = getattr(settings, "FIELD_ENCRYPTION_KEY", "")
    if not raw:
        raise RuntimeError(
            "FIELD_ENCRYPTION_KEY is not set. "
            "Generate one with: python -c \"import secrets, base64; "
            "print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())\""
        )
    key = base64.urlsafe_b64decode(raw.encode())
    if len(key) != 32:
        raise RuntimeError("FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes.")
    return key


def encrypt_field(plaintext: str) -> str:
    """
    Encrypt a plaintext string using AES-256-GCM.
    Returns a URL-safe base64 string: base64(nonce || ciphertext_with_tag).
    """
    if not _CRYPTO_AVAILABLE:
        raise RuntimeError("cryptography package is not installed.")
    if plaintext is None:
        return None
    key = _get_key()
    nonce = os.urandom(12)          # 96-bit nonce recommended for GCM
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    payload = nonce + ciphertext    # nonce (12 bytes) + ciphertext + 16-byte tag
    return base64.urlsafe_b64encode(payload).decode("ascii")


def decrypt_field(ciphertext_b64: str) -> str:
    """
    Decrypt a value produced by encrypt_field().
    Returns the original plaintext string.
    """
    if not _CRYPTO_AVAILABLE:
        raise RuntimeError("cryptography package is not installed.")
    if ciphertext_b64 is None:
        return None
    key = _get_key()
    payload = base64.urlsafe_b64decode(ciphertext_b64.encode("ascii"))
    nonce = payload[:12]
    ciphertext = payload[12:]
    aesgcm = AESGCM(key)
    plaintext_bytes = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext_bytes.decode("utf-8")


def mask_value(plaintext: str, visible_chars: int = 4) -> str:
    """
    Return a masked display string showing only the last N characters.

    Examples:
        mask_value("123-45-6789")  → "***-**-6789"
        mask_value("AB1234567")    → "*****4567"
        mask_value(None)           → ""
    """
    if not plaintext:
        return ""
    plaintext = str(plaintext)
    if len(plaintext) <= visible_chars:
        return "*" * len(plaintext)
    return "*" * (len(plaintext) - visible_chars) + plaintext[-visible_chars:]
