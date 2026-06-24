import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.location import Il, Ilce, Mahalle


def test_iller_returns_list(client: TestClient):
    res = client.get("/api/locations/iller")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    # Note: no seed data in test DB, so may be empty — just check structure
    if data:
        assert "id" in data[0]
        assert "name" in data[0]


def test_ilceler_requires_il_id(client: TestClient):
    res = client.get("/api/locations/ilceler?il_id=999")
    assert res.status_code == 200
    assert res.json() == []  # non-existent il_id → empty list


def test_mahalleler_requires_ilce_id(client: TestClient):
    res = client.get("/api/locations/mahalleler?ilce_id=999")
    assert res.status_code == 200
    assert res.json() == []


def test_ilceler_missing_param_returns_422(client: TestClient):
    res = client.get("/api/locations/ilceler")  # no il_id
    assert res.status_code == 422


def test_cascade_with_seeded_data(client: TestClient, session: Session):
    # Seed a minimal il+ilce+mahalle and verify cascade queries work
    il = Il(name="TestIl")
    session.add(il)
    session.flush()
    ilce = Ilce(name="TestIlce", il_id=il.id)
    session.add(ilce)
    session.flush()
    mahalle = Mahalle(name="TestMahalle", ilce_id=ilce.id)
    session.add(mahalle)
    session.commit()

    res = client.get("/api/locations/iller")
    assert any(i["name"] == "TestIl" for i in res.json())

    res2 = client.get(f"/api/locations/ilceler?il_id={il.id}")
    assert any(i["name"] == "TestIlce" for i in res2.json())

    res3 = client.get(f"/api/locations/mahalleler?ilce_id={ilce.id}")
    assert any(m["name"] == "TestMahalle" for m in res3.json())
