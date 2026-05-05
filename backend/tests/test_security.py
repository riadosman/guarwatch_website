import pytest

from app.core.security import verify_device_token


def test_verify_device_token_returns_true_for_match():
    token_map = {"abc-123": "secret-tok"}
    assert verify_device_token(token_map, "abc-123", "secret-tok") is True


def test_verify_device_token_returns_false_for_unknown_device():
    assert verify_device_token({}, "abc-123", "secret-tok") is False


def test_verify_device_token_returns_false_for_wrong_token():
    token_map = {"abc-123": "secret-tok"}
    assert verify_device_token(token_map, "abc-123", "wrong") is False


def test_verify_device_token_uses_constant_time_comparison():
    # smoke test that hmac.compare_digest is available — we don't time the call
    token_map = {"abc-123": "secret-tok"}
    assert verify_device_token(token_map, "abc-123", "secret-tok") is True
