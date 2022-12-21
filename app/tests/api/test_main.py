import pytest
from fastapi.testclient import TestClient

from app.main import app, health

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
