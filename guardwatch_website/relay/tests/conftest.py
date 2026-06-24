import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from guardwatch_website.relay.main import app
    return TestClient(app)
