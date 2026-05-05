from fastapi.testclient import TestClient

from agent.server import create_app


def test_agent_health() -> None:
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
