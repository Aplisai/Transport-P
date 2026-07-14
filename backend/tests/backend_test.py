"""Backend integration tests for RelaisPoint API.

Runs against the public REACT_APP_BACKEND_URL. Covers:
- 7 carriers (incl. colis_prive)
- 3193 points (2220 relais + 973 lockers)
- ptype filter (all / relais / locker)
- combined filters (ptype + q, ptype + carriers)
- GZip compression
- auth (register/login/logout/me), favorites lifecycle
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
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

EXPECTED_CARRIER_IDS = {
    "mondial_relay", "chronopost", "la_poste",
    "dpd", "ups", "relais_colis", "colis_prive",
}
EXPECTED_TOTAL = 3193
EXPECTED_RELAIS = 2220
EXPECTED_LOCKERS = 973


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
        assert len(data) == 7, f"expected 7 carriers, got {len(data)}"
        ids = {c["id"] for c in data}
        assert ids == EXPECTED_CARRIER_IDS, f"unexpected carriers: {ids}"
        for c in data:
            assert "name" in c and "color" in c
            assert c["color"].startswith("#") and len(c["color"]) == 7


# ============================================================ Points
class TestPoints:
    def test_get_all_points(self, s):
        r = s.get(f"{API}/points", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == EXPECTED_TOTAL, \
            f"expected {EXPECTED_TOTAL} points, got {len(data)}"
        # Each point should have a 'type' field
        types = {p.get("type") for p in data}
        assert types == {"relais", "locker"}, f"unexpected types: {types}"

    def test_point_schema(self, s):
        r = s.get(f"{API}/points", timeout=30)
        p = r.json()[0]
        for k in ("id", "type", "carrier", "carrier_name", "color", "name",
                  "address", "postal_code", "city", "lat", "lng", "hours"):
            assert k in p, f"missing key {k}"
        assert p["type"] in {"relais", "locker"}

    def test_ptype_relais_only(self, s):
        r = s.get(f"{API}/points", params={"ptype": "relais"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == EXPECTED_RELAIS, \
            f"expected {EXPECTED_RELAIS} relais, got {len(data)}"
        assert all(p["type"] == "relais" for p in data)

    def test_ptype_locker_only(self, s):
        r = s.get(f"{API}/points", params={"ptype": "locker"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == EXPECTED_LOCKERS, \
            f"expected {EXPECTED_LOCKERS} lockers, got {len(data)}"
        assert all(p["type"] == "locker" for p in data)

    def test_ptype_all_equals_no_param(self, s):
        r_all = s.get(f"{API}/points", params={"ptype": "all"}, timeout=30)
        r_none = s.get(f"{API}/points", timeout=30)
        assert r_all.status_code == 200 and r_none.status_code == 200
        assert len(r_all.json()) == len(r_none.json()) == EXPECTED_TOTAL

    def test_ptype_locker_and_search_lyon(self, s):
        r = s.get(f"{API}/points",
                  params={"ptype": "locker", "q": "Lyon"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert all(p["type"] == "locker" for p in data)
        # Must all match Lyon (city / postal / name)
        for p in data:
            assert ("lyon" in p["city"].lower()
                    or "lyon" in p["name"].lower()
                    or p["postal_code"].startswith("69"))

    def test_ptype_relais_and_carrier_dpd(self, s):
        r = s.get(f"{API}/points",
                  params={"ptype": "relais", "carriers": "dpd"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert all(p["type"] == "relais" for p in data)
        assert all(p["carrier"] == "dpd" for p in data)

    def test_filter_by_carriers(self, s):
        r = s.get(f"{API}/points",
                  params={"carriers": "mondial_relay,dpd"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert all(p["carrier"] in {"mondial_relay", "dpd"} for p in data)

    def test_search_by_city(self, s):
        r = s.get(f"{API}/points", params={"q": "Lyon"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert len(data) < EXPECTED_TOTAL
        assert any("Lyon" in p["city"] for p in data)

    def test_search_by_postal_code(self, s):
        r = s.get(f"{API}/points", params={"q": "75001"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert all(p["postal_code"] == "75001" for p in data)

    def test_search_accent_insensitive_nimes(self, s):
        """BUG-FIX: q=nimes must return Nîmes points (21)."""
        r = s.get(f"{API}/points", params={"q": "nimes"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 21, f"expected 21 Nîmes points for q=nimes, got {len(data)}"
        # Every entry must match Nîmes (any case, with or without accent)
        for p in data:
            city_norm = p["city"].lower().replace("î", "i").replace("Î", "I")
            assert "nimes" in city_norm or p["postal_code"].startswith("30"), \
                f"unexpected point in Nîmes search: {p['city']} / {p['postal_code']}"

    def test_search_lyon_count(self, s):
        """BUG-FIX: q=Lyon must return exactly 93 points per spec."""
        r = s.get(f"{API}/points", params={"q": "Lyon"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 93, f"expected 93 Lyon points for q=Lyon, got {len(data)}"

    def test_search_accent_insensitive_uppercase(self, s):
        """q=NIMES (all caps, no accent) must equal q=Nîmes case."""
        r_lower = s.get(f"{API}/points", params={"q": "nimes"}, timeout=30)
        r_upper = s.get(f"{API}/points", params={"q": "NIMES"}, timeout=30)
        r_accent = s.get(f"{API}/points", params={"q": "Nîmes"}, timeout=30)
        assert len(r_lower.json()) == len(r_upper.json()) == len(r_accent.json())

    def test_distance_sort(self, s):
        r = s.get(f"{API}/points",
                  params={"lat": 48.8566, "lng": 2.3522}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 1
        assert all("distance" in p for p in data)
        distances = [p["distance"] for p in data]
        assert distances == sorted(distances), "points should be sorted by distance asc"

    def test_get_point_by_id(self, s):
        listing = s.get(f"{API}/points", timeout=30).json()
        pid = listing[0]["id"]
        r = s.get(f"{API}/points/{pid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == pid

    def test_get_point_404(self, s):
        r = s.get(f"{API}/points/pt-99999999", timeout=15)
        assert r.status_code == 404


# ============================================================ Geocode
class TestGeocode:
    def test_geocode_valid_address_paris(self, s):
        r = s.get(f"{API}/geocode", params={"q": "10 rue de Rivoli Paris"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("lat") is not None, f"expected coords, got {data}"
        assert 48.7 <= data["lat"] <= 49.0, f"lat out of Paris range: {data['lat']}"
        assert 2.2 <= data["lng"] <= 2.5, f"lng out of Paris range: {data['lng']}"
        assert "label" in data

    def test_geocode_invalid_address(self, s):
        r = s.get(f"{API}/geocode", params={"q": "uihqweXYZnope"}, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"lat": None}

    def test_geocode_empty_query(self, s):
        r = s.get(f"{API}/geocode", params={"q": ""}, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"lat": None}


# ============================================================ GZip
class TestGZip:
    def test_gzip_encoding_on_points(self):
        # requests auto-adds Accept-Encoding gzip; capture raw response.
        r = requests.get(
            f"{API}/points",
            headers={"Accept-Encoding": "gzip"},
            timeout=30,
            stream=False,
        )
        assert r.status_code == 200
        # Content-Encoding must be gzip since payload > 1000 bytes
        enc = r.headers.get("Content-Encoding", "")
        assert "gzip" in enc.lower(), \
            f"expected gzip content-encoding, got headers: {dict(r.headers)}"


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
        assert "access_token" in sess.cookies.get_dict()

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
        me = sess.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 401


# ============================================================ Favorites
class TestFavorites:
    def test_favorites_require_auth(self):
        assert requests.get(f"{API}/favorites", timeout=15).status_code == 401
        assert requests.post(
            f"{API}/favorites", json={"point_id": "pt-00001"}, timeout=15
        ).status_code == 401
        assert requests.delete(
            f"{API}/favorites/pt-00001", timeout=15
        ).status_code == 401

    def test_favorite_lifecycle(self, fresh_user_session, s):
        sess, _, _ = fresh_user_session
        pid = s.get(f"{API}/points", timeout=30).json()[0]["id"]

        r = sess.post(f"{API}/favorites", json={"point_id": pid}, timeout=15)
        assert r.status_code == 200
        assert pid in r.json()["favorites"]

        r = sess.get(f"{API}/favorites", timeout=15)
        assert r.status_code == 200
        assert any(p["id"] == pid for p in r.json())

        r = sess.post(f"{API}/favorites", json={"point_id": pid}, timeout=15)
        assert r.json()["favorites"].count(pid) == 1

        r = sess.delete(f"{API}/favorites/{pid}", timeout=15)
        assert r.status_code == 200
        assert pid not in r.json()["favorites"]

        r = sess.get(f"{API}/favorites", timeout=15)
        assert all(p["id"] != pid for p in r.json())

    def test_favorite_invalid_point(self, fresh_user_session):
        sess, _, _ = fresh_user_session
        r = sess.post(f"{API}/favorites",
                      json={"point_id": "pt-99999999"}, timeout=15)
        assert r.status_code == 404
