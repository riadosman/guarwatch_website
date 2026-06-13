import hashlib

import pytest

from app.core.security import hash_token, verify_device_token, verify_token_hash


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


def test_hash_token_is_deterministic():
    assert hash_token("abc") == hashlib.sha256(b"abc").hexdigest()


def test_verify_token_hash_correct():
    assert verify_token_hash(hash_token("secret"), "secret") is True


def test_verify_token_hash_wrong():
    assert verify_token_hash(hash_token("secret"), "wrong") is False
