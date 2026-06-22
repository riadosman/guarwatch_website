import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from relay.main import app
    return TestClient(app)
