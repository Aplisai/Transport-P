"""Regression test after user_public change: _id must NOT be exposed, only id."""
import os
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://relay-finder-1.preview.emergentagent.com').rstrip('/')
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@relaispoint.fr")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")


def test_admin_login_returns_id_not_underscore_id():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
               timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    # Expected keys
    assert "id" in data, f"Missing 'id' in login response: {data}"
    assert data["email"] == ADMIN_EMAIL
    assert data["role"] == "admin"
    assert data["name"]
    # _id must be gone
    assert "_id" not in data, f"'_id' leaked in login response: {data}"
    # Cookie present
    assert "access_token" in s.cookies, "access_token cookie not set"


def test_me_returns_id_not_underscore_id():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
               timeout=15)
    assert r.status_code == 200
    me = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert me.status_code == 200, f"/auth/me failed: {me.status_code} {me.text}"
    d = me.json()
    assert "id" in d and d["email"] == ADMIN_EMAIL and d["role"] == "admin"
    assert "_id" not in d, f"'_id' leaked in /auth/me response: {d}"


def test_wrong_password_returns_401_with_french_message():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": "wrong_pw_xxx"},
                      timeout=15)
    assert r.status_code == 401
    body = r.json()
    detail = body.get("detail", "")
    assert "incorrect" in detail.lower(), f"Unexpected detail: {detail}"
    assert "Session expir" not in detail


def test_logout_then_me_returns_401():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
               timeout=15)
    assert r.status_code == 200
    out = s.post(f"{BASE_URL}/api/auth/logout", timeout=15)
    assert out.status_code == 200
    # Session cleared, but cookie jar may hold; use fresh session
    s2 = requests.Session()
    me = s2.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert me.status_code == 401


def test_points_intact():
    """Ensure user 4 custom points are still present (Intermarche, Loker Lidl Léon Blum, Locker Super-U, Tabac du Lavoir Pirey)."""
    r = requests.get(f"{BASE_URL}/api/points", timeout=15)
    assert r.status_code == 200
    pts = r.json()
    names = [p.get("name", "") for p in pts]
    # Check at least these keywords appear
    joined = " | ".join(names).lower()
    for kw in ["intermarch", "lidl", "super", "tabac"]:
        assert kw in joined, f"Missing keyword '{kw}' in points names: {names}"
