import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import SpaStaticFiles, api, app, health

client = TestClient(app)


@pytest.mark.unittest
@pytest.mark.asyncio
async def test_read_health():
    result = await health()
    assert result == {"message": "Health OK"}


@pytest.mark.integration
def test_read_health_call():
    response = client.get("/api/health")
    assert response.status_code == 200

    assert response.json() == {"message": "Health OK"}


@pytest.fixture
def spa_client(tmp_path):
    (tmp_path / "index.html").write_text("<div id=app></div>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    spa = FastAPI()
    spa.mount("/api", api)
    spa.mount("/", SpaStaticFiles(directory=tmp_path, html=True), name="static")
    return TestClient(spa)


@pytest.mark.integration
@pytest.mark.parametrize("route", ["/", "/signin", "/places/11111111-1111-4111-8111-111111111111"])
def test_app_routes_serve_index(spa_client, route):
    response = spa_client.get(route)
    assert response.status_code == 200
    assert response.text == "<div id=app></div>"


@pytest.mark.integration
def test_files_still_served_and_missing_files_404(spa_client):
    assert spa_client.get("/assets/app.js").text == "console.log(1)"
    assert spa_client.get("/assets/missing.js").status_code == 404


@pytest.mark.integration
def test_api_unchanged_beside_spa(spa_client):
    assert spa_client.get("/api/health").json() == {"message": "Health OK"}
