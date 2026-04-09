"""
tests/unit/conftest.py

Applies the `unit` marker and `django_db` access to every test in this
subtree automatically — individual test functions don't need to repeat
@pytest.mark.django_db.
"""
import pytest


# Apply to every test collected under tests/unit/
pytestmark = [
    pytest.mark.unit,
    pytest.mark.django_db,
]
