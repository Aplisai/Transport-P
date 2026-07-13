"""Backend integration tests for RelaisPoint API.

Runs against the public REACT_APP_BACKEND_URL. Uses a fresh registered user for
favorites tests and the seeded admin for login validation.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # fallback to reading frontend .env file
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip()
                    break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@relaispoint.fr"
ADMIN_PASSWORD = "admin123"


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def fresh_user_session():
    """Register a fresh user and return an authenticated session (cookie)."""
    sess = requests.Session()
    email = f"TEST_{uuid.uuid4().hex[:10]}@relaispoint.fr"
    password = "testpass123"
    r = sess.post(
        f"{API}/auth/register",
        json={"email": email, "password": password, "name": "Test User"},
        timeout=15,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return sess, email, password


# ============================================================ Carriers
class TestCarriers:
    def test_get_carriers(self, s):
        r = s.get(f"{API}/carriers", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 6
        ids = {c["id"] for c in data}
        assert ids == {
            "mondial_relay", "chronopost", "la_poste",
            "dpd", "ups", "relais_colis",
        }
        for c in data:
            assert "name" in c and "color" in c
            assert c["color"].startswith("#") and len(c["color"]) == 7


# ============================================================ Points
class TestPoints:
    def test_get_all_points(self, s):
        r = s.get(f"{API}/points", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # ~226 points expected across French cities
        assert 200 <= len(data) <= 270, f"unexpected point count: {len(data)}"
        p = data[0]
        for k in ("id", "carrier", "carrier_name", "color", "name",
                  "address", "postal_code", "city", "lat", "lng", "hours"):
            assert k in p, f"missing key {k}"

    def test_filter_by_carriers(self, s):
        r = s.get(f"{API}/points",
                  params={"carriers": "mondial_relay,dpd"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert all(p["carrier"] in {"mondial_relay", "dpd"} for p in data)

    def test_search_by_city(self, s):
        r = s.get(f"{API}/points", params={"q": "Lyon"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        # Search matches city, postal_code, or name (which contains carrier name)
        # Ensure filter actually reduced results
        r_all = s.get(f"{API}/points", timeout=15)
        assert len(data) < len(r_all.json())
        assert any("Lyon" in p["city"] for p in data)

    def test_search_by_postal_code(self, s):
        r = s.get(f"{API}/points", params={"q": "75001"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert all(p["postal_code"] == "75001" for p in data)

    def test_distance_sort(self, s):
        # Paris center
        r = s.get(f"{API}/points",
                  params={"lat": 48.8566, "lng": 2.3522}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 1
        assert all("distance" in p for p in data)
        distances = [p["distance"] for p in data]
        assert distances == sorted(distances), "points should be sorted by distance asc"
        # Nearest should be a Paris point
        assert data[0]["city"].startswith("Paris") or data[0]["distance"] < 50

    def test_get_point_by_id(self, s):
        listing = s.get(f"{API}/points", timeout=15).json()
        pid = listing[0]["id"]
        r = s.get(f"{API}/points/{pid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == pid

    def test_get_point_404(self, s):
        r = s.get(f"{API}/points/pt-99999", timeout=15)
        assert r.status_code == 404


# ============================================================ Auth
class TestAuth:
    def test_login_admin(self):
        sess = requests.Session()
        r = sess.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"
        # cookie should be set
        assert "access_token" in sess.cookies.get_dict(), \
            f"cookie missing: {sess.cookies.get_dict()}"

    def test_login_wrong_password(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": "wrongpass"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_register_duplicate(self, fresh_user_session):
        _sess, email, password = fresh_user_session
        r = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": password, "name": "dup"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_authed(self, fresh_user_session):
        sess, email, _ = fresh_user_session
        r = sess.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == email.lower()

    def test_logout_clears_cookie(self):
        sess = requests.Session()
        sess.post(
            f"{API}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=15,
        )
        assert "access_token" in sess.cookies.get_dict()
        r = sess.post(f"{API}/auth/logout", timeout=15)
        assert r.status_code == 200
        # After logout, /me should be 401 with the same session
        me = sess.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 401


# ============================================================ Favorites
class TestFavorites:
    def test_favorites_require_auth(self):
        assert requests.get(f"{API}/favorites", timeout=15).status_code == 401
        assert requests.post(
            f"{API}/favorites", json={"point_id": "pt-0001"}, timeout=15
        ).status_code == 401
        assert requests.delete(
            f"{API}/favorites/pt-0001", timeout=15
        ).status_code == 401

    def test_favorite_lifecycle(self, fresh_user_session, s):
        sess, _, _ = fresh_user_session
        pid = s.get(f"{API}/points", timeout=15).json()[0]["id"]

        # Add
        r = sess.post(f"{API}/favorites", json={"point_id": pid}, timeout=15)
        assert r.status_code == 200
        assert pid in r.json()["favorites"]

        # List
        r = sess.get(f"{API}/favorites", timeout=15)
        assert r.status_code == 200
        listed = r.json()
        assert any(p["id"] == pid for p in listed)

        # Idempotent add
        r = sess.post(f"{API}/favorites", json={"point_id": pid}, timeout=15)
        favs = r.json()["favorites"]
        assert favs.count(pid) == 1

        # Delete
        r = sess.delete(f"{API}/favorites/{pid}", timeout=15)
        assert r.status_code == 200
        assert pid not in r.json()["favorites"]

        # Verify gone
        r = sess.get(f"{API}/favorites", timeout=15)
        assert all(p["id"] != pid for p in r.json())

    def test_favorite_invalid_point(self, fresh_user_session):
        sess, _, _ = fresh_user_session
        r = sess.post(f"{API}/favorites",
                      json={"point_id": "pt-99999"}, timeout=15)
        assert r.status_code == 404
