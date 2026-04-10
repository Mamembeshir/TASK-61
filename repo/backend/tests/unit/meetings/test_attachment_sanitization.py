"""
tests/unit/meetings/test_attachment_sanitization.py

Unit tests for _save_attachment filename sanitization in meetings/views.py.

These tests call _save_attachment directly (bypassing HTTP) to validate the
server-side checks that cannot be exercised through Django's test client,
because Django's own encode_file() applies os.path.basename() before the
multipart body reaches the view.

Security properties verified:
  - Null bytes in filenames are rejected before they reach the filesystem.
  - Path separators (/ and \\) in filenames are explicitly rejected.
  - Empty filenames are rejected.
  - Only allowlisted extensions are accepted.
  - The stored filename is a UUID, never the client-supplied name.
"""
import io
import os
import re

import pytest

from core.exceptions import UnprocessableEntity
from meetings.views import _save_attachment


def _mock_file(name: str, content: bytes = b"%PDF-1.4 minimal", size: int = None):
    """Create a minimal file-like object as Django would produce from a multipart upload."""
    f = io.BytesIO(content)
    f.name = name
    f.size = size if size is not None else len(content)
    # Provide chunks() method like Django's InMemoryUploadedFile
    f.chunks = lambda: [content]
    f.seek(0)
    return f


pytestmark = [pytest.mark.unit, pytest.mark.django_db]


# ---------------------------------------------------------------------------
# Names that must be rejected
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("bad_name", [
    "../../etc/passwd.pdf",         # Unix path traversal
    "../secret.pdf",                # single-level traversal
    "/absolute/path.pdf",           # absolute path injection (Unix)
    "..\\windows\\system32.pdf",    # Windows-style traversal
    "C:\\path\\to\\file.pdf",       # Windows absolute path
    "null\x00byte.pdf",             # null-byte injection
    "",                             # empty name
])
def test_malicious_filenames_are_rejected(bad_name, tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    import uuid
    meeting_id = uuid.uuid4()
    with pytest.raises(UnprocessableEntity):
        _save_attachment(meeting_id, _mock_file(bad_name))


# ---------------------------------------------------------------------------
# Extension allowlist
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("bad_ext", ["exe", "sh", "py", "js", "php", "bat", "cmd"])
def test_disallowed_extension_rejected(bad_ext, tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    import uuid
    meeting_id = uuid.uuid4()
    with pytest.raises(UnprocessableEntity):
        _save_attachment(meeting_id, _mock_file(f"payload.{bad_ext}"))


@pytest.mark.parametrize("good_ext", ["pdf", "docx", "xlsx", "pptx", "png", "jpg", "jpeg"])
def test_allowed_extensions_accepted(good_ext, tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    import uuid
    meeting_id = uuid.uuid4()
    path = _save_attachment(meeting_id, _mock_file(f"document.{good_ext}"))
    assert path.endswith(f".{good_ext}")


# ---------------------------------------------------------------------------
# UUID storage — stored filename must not mirror client-supplied name
# ---------------------------------------------------------------------------

def test_stored_filename_is_uuid_not_original(tmp_path, settings):
    settings.MEDIA_ROOT = str(tmp_path)
    import uuid
    meeting_id = uuid.uuid4()
    path = _save_attachment(meeting_id, _mock_file("my_secret_report.pdf"))
    stored_filename = os.path.basename(path)
    # Must not contain any part of the original name
    assert "my_secret_report" not in stored_filename
    # Must match UUID hex pattern: 32 hex chars + .pdf
    assert re.match(r"^[0-9a-f]{32}\.pdf$", stored_filename), stored_filename


def test_path_traversal_name_stored_as_uuid(tmp_path, settings):
    """
    Even if a traversal name somehow passed the up-front checks (e.g. a future
    refactor), the stored path must always be UUID-based and inside the correct
    directory — never an absolute path or traversal.
    """
    settings.MEDIA_ROOT = str(tmp_path)
    import uuid
    meeting_id = uuid.uuid4()
    # "passwd.pdf" is what Django's test client would send for "../../etc/passwd.pdf"
    # (basename applied by Django encode_file). Our server must store it safely.
    path = _save_attachment(meeting_id, _mock_file("passwd.pdf"))
    # Stored relative path must start with the expected subdirectory
    assert path.startswith(f"meeting_attachments/{meeting_id}/")
    # Must not contain any traversal sequences
    assert ".." not in path
    assert path == os.path.normpath(path)
