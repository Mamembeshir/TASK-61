"""
Root conftest.py

Loaded by pytest before any test file.  Registers custom markers so they
don't produce PytestUnknownMarkWarning.
"""
import pytest


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "unit: Pure unit / model-layer tests.  Uses real DB; no HTTP.",
    )
    config.addinivalue_line(
        "markers",
        "api: API integration tests.  Uses real DB + full DRF HTTP stack.",
    )
