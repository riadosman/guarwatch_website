import time
import pytest
from guardwatch_website.relay.pairing import PairingService, PAIRING_TTL_SECONDS


@pytest.fixture
def svc():
    return PairingService()


def test_generate_returns_6_char_uppercase_hex(svc):
    code = svc.generate_code("device-1")
    assert len(code) == 6
    assert code == code.upper()
    int(code, 16)  # geçerli hex mi


def test_validate_returns_device_id(svc):
    code = svc.generate_code("device-1")
    result = svc.validate_and_consume(code)
    assert result == "device-1"


def test_validate_consumes_code(svc):
    code = svc.generate_code("device-1")
    svc.validate_and_consume(code)
    result = svc.validate_and_consume(code)
    assert result is None


def test_validate_returns_none_for_unknown_code(svc):
    result = svc.validate_and_consume("FFFFFF")
    assert result is None


def test_validate_case_insensitive(svc):
    code = svc.generate_code("device-1")
    result = svc.validate_and_consume(code.lower())
    assert result == "device-1"


def test_generate_replaces_old_code_for_same_device(svc):
    old_code = svc.generate_code("device-1")
    _new_code = svc.generate_code("device-1")
    result = svc.validate_and_consume(old_code)
    assert result is None


def test_expired_code_returns_none(svc, monkeypatch):
    code = svc.generate_code("device-1")
    monkeypatch.setattr(
        "guardwatch_website.relay.pairing.time",
        type("t", (), {"time": staticmethod(lambda: time.time() + PAIRING_TTL_SECONDS + 1)})()
    )
    result = svc.validate_and_consume(code)
    assert result is None
