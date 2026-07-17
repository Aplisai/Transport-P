from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

import os
import math
import logging
import unicodedata
import secrets
import tempfile
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower().strip()

import jwt
import bcrypt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, UploadFile, File
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, BeforeValidator, ConfigDict

from relay_data import POINTS as _DEMO_POINTS, CARRIERS
from emergentintegrations.llm.openai import OpenAISpeechToText

# Jeu de données de démo activable/désactivable. Si désactivé, l'application
# démarre vide et n'affiche que les points ajoutés manuellement par l'admin.
_DEMO_ENABLED = os.environ.get("DEMO_POINTS_ENABLED", "true").lower() != "false"
POINTS = _DEMO_POINTS if _DEMO_ENABLED else []

# ---------------------------------------------------------------- DB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PyObjectId = Annotated[str, BeforeValidator(str)]

# ---------------------------------------------------------------- Models
class UserOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: PyObjectId = Field(alias="_id")
    email: str
    name: str
    role: str = "user"

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class FavoriteIn(BaseModel):
    point_id: str

class PointOverrideIn(BaseModel):
    name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

class PointFullIn(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    carrier: Optional[str] = None
    carriers: Optional[List[str]] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    lat: float
    lng: float
    hours: Optional[dict] = None

class PointPatchIn(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    carrier: Optional[str] = None
    carriers: Optional[List[str]] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    hours: Optional[dict] = None

# ---------------------------------------------------------------- Auth helpers
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(key="access_token", value=token, httponly=True,
                        secure=True, samesite="none", max_age=604800, path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Utilisateur introuvable")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expirée")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Jeton invalide")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé à l'administrateur")
    return user


def user_public(user: dict) -> dict:
    return {"_id": str(user["_id"]), "email": user["email"],
            "name": user.get("name", ""), "role": user.get("role", "user")}

def haversine(lat1, lng1, lat2, lng2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a)), 2)

# ---------------------------------------------------------------- Auth routes
@api_router.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    doc = {"email": email, "password_hash": hash_password(data.password),
           "name": data.name, "role": "user", "favorites": [],
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.users.insert_one(doc)
    token = create_access_token(str(res.inserted_id), email)
    set_auth_cookie(response, token)
    doc["_id"] = res.inserted_id
    return user_public(doc)

@api_router.post("/auth/login")
async def login(data: LoginIn, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    token = create_access_token(str(user["_id"]), email)
    set_auth_cookie(response, token)
    return user_public(user)

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_public(user)

class ForgotIn(BaseModel):
    email: EmailStr

class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=6)

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)

@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotIn):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        # Ne pas révéler l'existence du compte
        return {"ok": True, "message": "Si ce compte existe, un code de réinitialisation a été généré."}
    token = secrets.token_urlsafe(24)
    await db.password_reset_tokens.insert_one({
        "user_id": str(user["_id"]),
        "token": token,
        "used": False,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
    })
    logger.info("Reset token pour %s : %s", email, token)
    # Mode sans e-mail : le code est renvoyé pour permettre la réinitialisation dans l'app
    return {"ok": True, "reset_token": token,
            "message": "Code de réinitialisation généré."}

@api_router.post("/auth/reset-password")
async def reset_password(data: ResetIn):
    doc = await db.password_reset_tokens.find_one({"token": data.token})
    if not doc or doc.get("used"):
        raise HTTPException(status_code=400, detail="Code invalide ou déjà utilisé")
    exp = doc["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Code expiré, refaites une demande")
    await db.users.update_one({"_id": ObjectId(doc["user_id"])},
                              {"$set": {"password_hash": hash_password(data.password)}})
    await db.password_reset_tokens.update_one({"_id": doc["_id"]}, {"$set": {"used": True}})
    return {"ok": True, "message": "Mot de passe réinitialisé. Vous pouvez vous connecter."}

@api_router.post("/auth/change-password")
async def change_password(data: ChangePasswordIn, user: dict = Depends(get_current_user)):
    if not verify_password(data.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    if data.new_password == data.current_password:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit être différent de l'actuel")
    await db.users.update_one({"_id": user["_id"]},
                              {"$set": {"password_hash": hash_password(data.new_password)}})
    return {"ok": True, "message": "Mot de passe modifié avec succès."}

# ---------------------------------------------------------------- Relay points
# Index des localités uniques (ville + code postal) pour l'autocomplétion
_LOC_INDEX = {}
for _p in POINTS:
    _key = (_p["city"], _p["postal_code"])
    if _key not in _LOC_INDEX:
        _LOC_INDEX[_key] = {
            "city": _p["city"],
            "postal_code": _p["postal_code"],
            "lat": _p["lat"],
            "lng": _p["lng"],
            "label": f"{_p['city']} ({_p['postal_code']})",
        }
_LOCS = list(_LOC_INDEX.values())


@api_router.get("/suggest")
def suggest(q: str, limit: int = 8):
    if not q or not q.strip():
        return []
    raw = q.strip()
    ql = _norm(raw)
    # Index des localités uniques construit à la volée sur les points effectifs
    # (démo + points ajoutés par l'admin), pour rester à jour.
    seen = set()
    locs = []
    for p in _effective_points():
        key = (p.get("city"), p.get("postal_code"))
        if key in seen:
            continue
        seen.add(key)
        locs.append({
            "city": p.get("city", ""),
            "postal_code": p.get("postal_code", ""),
            "lat": p["lat"],
            "lng": p["lng"],
            "label": f"{p.get('city', '')} ({p.get('postal_code', '')})",
        })
    res = []
    for loc in locs:
        city_n = _norm(loc["city"])
        if city_n.startswith(ql) or ql in city_n or loc["postal_code"].startswith(raw):
            res.append(loc)
    res.sort(key=lambda l: (
        not (_norm(l["city"]).startswith(ql) or l["postal_code"].startswith(raw)),
        l["city"],
        l["postal_code"],
    ))
    return res[:limit]


@api_router.get("/carriers")
async def get_carriers():
    return [{"id": k, "name": v["name"], "color": v["color"]} for k, v in CARRIERS.items()]


# ---- Couche données administrateur (CRUD complet) ----
# _OVERRIDES: modifications de champs sur les points statiques
# _DELETED: ids de points statiques masqués
# _CUSTOM: points créés par l'admin (id -> doc)
_OVERRIDES = {}
_DELETED = set()
_CUSTOM = {}

_EDITABLE = ["name", "type", "carrier", "carriers", "address", "postal_code",
             "city", "phone", "lat", "lng", "hours"]


def _carrier_fields(carrier):
    c = CARRIERS.get(carrier)
    if c:
        return c["name"], c["color"]
    return (carrier or "Point relais"), "#94A3B8"


def _validate_coords(lat, lng):
    if lat is not None and not (41.0 <= lat <= 51.5):
        raise HTTPException(status_code=400, detail="Latitude hors de France (41–51.5)")
    if lng is not None and not (-5.8 <= lng <= 9.8):
        raise HTTPException(status_code=400, detail="Longitude hors de France (-5.8–9.8)")


def _apply_override(p: dict) -> dict:
    ov = _OVERRIDES.get(p["id"])
    if not ov:
        return p
    merged = dict(p)
    for k in _EDITABLE:
        if k in ov and ov[k] is not None:
            merged[k] = ov[k]
    if "carrier" in ov and ov["carrier"]:
        merged["carrier_name"], merged["color"] = _carrier_fields(ov["carrier"])
        if "carriers" not in ov:
            merged["carriers"] = [ov["carrier"]]
    merged["edited"] = True
    return merged


def _effective_points():
    pts = [_apply_override(p) for p in POINTS if p["id"] not in _DELETED]
    pts.extend(_CUSTOM.values())
    return pts


@api_router.get("/points")
async def get_points(
    carriers: Optional[str] = None,
    q: Optional[str] = None,
    ptype: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    limit: int = 10000,
):
    selected = set(carriers.split(",")) if carriers else None
    results = []
    for p in _effective_points():
        if selected and not (selected & set(p.get("carriers", [p["carrier"]]))):
            continue
        if ptype and ptype != "all" and p.get("type", "relais") != ptype:
            continue
        if q:
            ql = _norm(q)
            if ql not in _norm(p["city"]) and ql not in p["postal_code"] and ql not in _norm(p["name"]):
                continue
        item = dict(p)
        if lat is not None and lng is not None:
            item["distance"] = haversine(lat, lng, item["lat"], item["lng"])
        results.append(item)
    if lat is not None and lng is not None:
        results.sort(key=lambda x: x.get("distance", 9999))
    return results[:limit]


def _normalize_hours(h):
    if not isinstance(h, dict):
        return {"lun-ven": "", "sam": "", "dim": ""}
    return {
        "lun-ven": h.get("lun-ven", "") or "",
        "sam": h.get("sam", "") or "",
        "dim": h.get("dim", "") or "",
    }


@api_router.post("/admin/points")
async def admin_create_point(data: PointFullIn, admin: dict = Depends(require_admin)):
    _validate_coords(data.lat, data.lng)
    pid = f"cust-{secrets.token_hex(6)}"
    carrier = data.carrier or "mondial_relay"
    cname, color = _carrier_fields(carrier)
    point = {
        "id": pid,
        "type": data.type or "relais",
        "carrier": carrier,
        "carrier_name": cname,
        "color": color,
        "carriers": data.carriers or [carrier],
        "name": (data.name or "").strip() or "Nouveau point",
        "address": data.address or "",
        "postal_code": data.postal_code or "",
        "city": data.city or "",
        "lat": round(data.lat, 6),
        "lng": round(data.lng, 6),
        "phone": data.phone or "",
        "hours": _normalize_hours(data.hours),
        "custom": True,
    }
    await db.custom_points.update_one({"id": pid}, {"$set": point}, upsert=True)
    _CUSTOM[pid] = point
    return point


@api_router.put("/admin/points/{point_id}")
async def admin_update_point(point_id: str, data: PointPatchIn, admin: dict = Depends(require_admin)):
    _validate_coords(data.lat, data.lng)
    fields = {}
    if data.name is not None:
        fields["name"] = data.name
    if data.type is not None:
        fields["type"] = data.type
    if data.carrier is not None:
        fields["carrier"] = data.carrier
    if data.carriers is not None:
        fields["carriers"] = data.carriers
    if data.address is not None:
        fields["address"] = data.address
    if data.postal_code is not None:
        fields["postal_code"] = data.postal_code
    if data.city is not None:
        fields["city"] = data.city
    if data.phone is not None:
        fields["phone"] = data.phone
    if data.lat is not None:
        fields["lat"] = round(data.lat, 6)
    if data.lng is not None:
        fields["lng"] = round(data.lng, 6)
    if data.hours is not None:
        fields["hours"] = _normalize_hours(data.hours)

    if point_id in _CUSTOM:  # point créé par admin → édition directe
        pt = dict(_CUSTOM[point_id])
        pt.update(fields)
        if "carrier" in fields:
            pt["carrier_name"], pt["color"] = _carrier_fields(fields["carrier"])
            pt.setdefault("carriers", [fields["carrier"]])
        await db.custom_points.update_one({"id": point_id}, {"$set": pt}, upsert=True)
        _CUSTOM[point_id] = pt
        return pt

    base = next((p for p in POINTS if p["id"] == point_id), None)
    if not base or point_id in _DELETED:
        raise HTTPException(status_code=404, detail="Point relais introuvable")
    await db.point_overrides.update_one(
        {"point_id": point_id}, {"$set": {"point_id": point_id, **fields}}, upsert=True)
    _OVERRIDES[point_id] = {**_OVERRIDES.get(point_id, {}), **fields}
    return _apply_override(base)


@api_router.delete("/admin/points/{point_id}")
async def admin_delete_point(point_id: str, admin: dict = Depends(require_admin)):
    if point_id in _CUSTOM:
        await db.custom_points.delete_one({"id": point_id})
        _CUSTOM.pop(point_id, None)
        return {"ok": True, "deleted": point_id}
    base = next((p for p in POINTS if p["id"] == point_id), None)
    if not base:
        raise HTTPException(status_code=404, detail="Point relais introuvable")
    await db.deleted_points.update_one({"point_id": point_id}, {"$set": {"point_id": point_id}}, upsert=True)
    await db.point_overrides.delete_one({"point_id": point_id})
    _DELETED.add(point_id)
    _OVERRIDES.pop(point_id, None)
    return {"ok": True, "deleted": point_id}


@api_router.get("/address-suggest")
def address_suggest(q: str, limit: int = 6):
    """Autocomplétion d'adresse via l'API Adresse (BAN, data.gouv.fr)."""
    if not q or len(q.strip()) < 3:
        return []
    try:
        r = requests.get(
            "https://api-adresse.data.gouv.fr/search/",
            params={"q": q.strip(), "limit": limit, "autocomplete": 1},
            headers={"User-Agent": "RelayDip/1.0"},
            timeout=8,
        )
        data = r.json()
    except Exception as e:
        logger.warning("Address-suggest error: %s", e)
        return []
    out = []
    for f in data.get("features", []):
        try:
            p = f.get("properties", {})
            coords = f.get("geometry", {}).get("coordinates", [])
            out.append({
                "label": p.get("label", ""),
                "address": p.get("name", "") if p.get("type") != "municipality" else "",
                "postal_code": p.get("postcode", ""),
                "city": p.get("city", ""),
                "lat": float(coords[1]),
                "lng": float(coords[0]),
            })
        except (KeyError, ValueError, TypeError, IndexError):
            continue
    return out


@api_router.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="Audio vide")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier audio trop volumineux (max 25 Mo)")
    suffix = ".webm"
    fn = (audio.filename or "").lower()
    for ext in (".webm", ".mp3", ".wav", ".m4a", ".mp4", ".mpeg", ".mpga"):
        if fn.endswith(ext):
            suffix = ext
            break
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        stt = OpenAISpeechToText(api_key=os.environ["EMERGENT_LLM_KEY"])
        with open(tmp_path, "rb") as f:
            resp = await stt.transcribe(file=f, model="whisper-1", language="fr", response_format="json")
        return {"text": (getattr(resp, "text", "") or "").strip()}
    except Exception as e:
        logger.warning("Transcribe error: %s", e)
        raise HTTPException(status_code=502, detail="Échec de la transcription vocale")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@api_router.get("/geocode")
def geocode(q: str):
    if not q or not q.strip():
        return {"lat": None}
    # 1) API Adresse (BAN) — fiable pour la France
    try:
        r = requests.get(
            "https://api-adresse.data.gouv.fr/search/",
            params={"q": q.strip(), "limit": 1},
            headers={"User-Agent": "RelayDip/1.0"},
            timeout=8,
        )
        feats = r.json().get("features", [])
        if feats:
            c = feats[0]["geometry"]["coordinates"]
            return {
                "lat": float(c[1]),
                "lng": float(c[0]),
                "label": feats[0]["properties"].get("label", q),
            }
    except Exception as e:
        logger.warning("Geocode (BAN) error: %s", e)
    # 2) Repli Nominatim
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": q, "format": "json", "countrycodes": "fr", "limit": 1},
            headers={"User-Agent": "RelayDip/1.0 (points relais France)"},
            timeout=10,
        )
        data = r.json()
    except Exception as e:
        logger.warning("Geocode error: %s", e)
        return {"lat": None}
    if not data:
        return {"lat": None}
    try:
        return {
            "lat": float(data[0]["lat"]),
            "lng": float(data[0]["lon"]),
            "label": data[0].get("display_name", q),
        }
    except (KeyError, ValueError, TypeError):
        return {"lat": None}


# ---------------------------------------------------------------- Live data (OpenStreetMap)
_CARRIER_MATCH = [
    ("mondial relay", "mondial_relay"),
    ("chronopost", "chronopost"),
    ("colissimo", "la_poste"),
    ("la poste", "la_poste"),
    ("pickup", "la_poste"),
    ("relais colis", "relais_colis"),
    ("colis prive", "colis_prive"),
    ("colis privé", "colis_prive"),
    ("dpd", "dpd"),
    ("ups", "ups"),
    ("vinted", "vinted_go"),
    ("amazon", "amazon"),
]
_LIVE_CACHE = {}
_LIVE_TTL = 300  # secondes


def _detect_carrier(tags):
    hay = _norm(" ".join([
        tags.get("brand", ""), tags.get("operator", ""), tags.get("name", ""),
    ]))
    for needle, cid in _CARRIER_MATCH:
        if _norm(needle) in hay:
            return cid, CARRIERS[cid]["name"], CARRIERS[cid]["color"]
    label = tags.get("brand") or tags.get("operator") or tags.get("name") or "Point relais"
    return "autre", label, "#94A3B8"


def _osm_to_point(el):
    tags = el.get("tags", {})
    lat = el.get("lat") or (el.get("center") or {}).get("lat")
    lng = el.get("lon") or (el.get("center") or {}).get("lon")
    if lat is None or lng is None:
        return None
    cid, cname, color = _detect_carrier(tags)
    is_locker = (
        tags.get("amenity") == "parcel_locker"
        or (tags.get("amenity") == "vending_machine" and "parcel" in tags.get("vending", ""))
    )
    house = tags.get("addr:housenumber", "")
    street = tags.get("addr:street", "")
    address = (f"{house} {street}").strip() or tags.get("addr:full", "") or "Adresse non communiquée"
    oh = tags.get("opening_hours")
    hours = {
        "lun-ven": oh if oh else "Horaires non communiqués",
        "sam": "—",
        "dim": "—",
    }
    name = tags.get("name") or f"{cname} - {tags.get('brand', 'Point relais')}"
    return {
        "id": f"osm-{el.get('type')}-{el.get('id')}",
        "type": "locker" if is_locker else "relais",
        "carrier": cid,
        "carrier_name": cname,
        "color": color,
        "carriers": [cid],
        "name": name,
        "address": address,
        "postal_code": tags.get("addr:postcode", ""),
        "city": tags.get("addr:city", ""),
        "lat": round(float(lat), 6),
        "lng": round(float(lng), 6),
        "hours": hours,
        "phone": tags.get("phone") or tags.get("contact:phone") or "",
    }


@api_router.get("/live/points")
def live_points(
    q: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: float = 15,
    carriers: Optional[str] = None,
    ptype: Optional[str] = None,
):
    # 1) Déterminer le centre
    if (lat is None or lng is None) and q and q.strip():
        try:
            geo = geocode(q)
        except HTTPException:
            return {"center": None, "points": [], "message": "Service de géocodage momentanément indisponible, réessayez"}
        if geo.get("lat") is None:
            return {"center": None, "points": [], "message": "Lieu introuvable"}
        lat, lng = geo["lat"], geo["lng"]
    if lat is None or lng is None:
        return {"center": None, "points": [], "message": "Précisez une ville ou votre position"}

    meters = int(min(max(radius, 1), 25) * 1000)  # Overpass: rayon plafonné à 25 km
    ckey = (round(lat, 3), round(lng, 3), meters)
    now = datetime.now(timezone.utc).timestamp()
    cached = _LIVE_CACHE.get(ckey)
    if cached and now - cached[0] < _LIVE_TTL:
        raw = cached[1]
    else:
        query = f"""
[out:json][timeout:25];
(
  nwr(around:{meters},{lat},{lng})["amenity"="parcel_locker"];
  nwr(around:{meters},{lat},{lng})["amenity"="vending_machine"]["vending"~"parcel"];
  nwr(around:{meters},{lat},{lng})["parcel_pickup"];
  nwr(around:{meters},{lat},{lng})["shop"="pickup"];
  nwr(around:{meters},{lat},{lng})["post_office"~"post_partner|parcel_pickup"];
);
out center tags 400;
"""
        try:
            r = requests.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
                headers={"User-Agent": "RelayDip/1.0 (points relais France)"},
                timeout=30,
            )
            raw = r.json().get("elements", [])
        except Exception as e:
            logger.warning("Overpass error: %s", e)
            raise HTTPException(status_code=502, detail="Service OpenStreetMap indisponible, réessayez")
        _LIVE_CACHE[ckey] = (now, raw)

    selected = set(carriers.split(",")) if carriers else None
    points = []
    for el in raw:
        p = _osm_to_point(el)
        if not p:
            continue
        if ptype and ptype != "all" and p["type"] != ptype:
            continue
        if selected and not (selected & set(p["carriers"])):
            continue
        p["distance"] = haversine(lat, lng, p["lat"], p["lng"])
        points.append(p)
    points.sort(key=lambda x: x["distance"])
    return {"center": {"lat": lat, "lng": lng}, "points": points}


@api_router.get("/mondialrelay/points")
def mondialrelay_points(
    q: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: float = 20,
    ptype: Optional[str] = None,
):
    import mondial_relay as mr

    center = None
    ville, cp = "", ""
    if lat is not None and lng is not None:
        center = {"lat": lat, "lng": lng}
    elif q and q.strip():
        raw = q.strip()
        if raw.isdigit():
            cp = raw
        else:
            ville = raw
        try:
            geo = geocode(q)
            if geo.get("lat") is not None:
                center = {"lat": geo["lat"], "lng": geo["lng"]}
                lat, lng = geo["lat"], geo["lng"]
        except HTTPException:
            pass
    else:
        return {"center": None, "points": [], "message": "Précisez une ville ou votre position"}

    res = mr.search(ville=ville, cp=cp, lat=lat, lng=lng,
                    action="24R", radius=int(min(max(radius, 1), 50)))
    points = res["points"]
    if ptype and ptype != "all":
        points = [p for p in points if p["type"] == ptype]
    if center:
        for p in points:
            p["distance"] = haversine(center["lat"], center["lng"], p["lat"], p["lng"])
        points.sort(key=lambda x: x.get("distance", 9999))
    return {"center": center, "points": points, "message": res["message"]}




@api_router.get("/points/{point_id}")
async def get_point(point_id: str):
    if point_id in _CUSTOM:
        return _CUSTOM[point_id]
    if point_id in _DELETED:
        raise HTTPException(status_code=404, detail="Point relais introuvable")
    for p in POINTS:
        if p["id"] == point_id:
            return _apply_override(p)
    raise HTTPException(status_code=404, detail="Point relais introuvable")

# ---------------------------------------------------------------- Favorites
@api_router.get("/favorites")
async def list_favorites(user: dict = Depends(get_current_user)):
    fav_ids = set(user.get("favorites", []))
    return [p for p in POINTS if p["id"] in fav_ids]

@api_router.post("/favorites")
async def add_favorite(data: FavoriteIn, user: dict = Depends(get_current_user)):
    if not any(p["id"] == data.point_id for p in POINTS):
        raise HTTPException(status_code=404, detail="Point relais introuvable")
    await db.users.update_one({"_id": user["_id"]}, {"$addToSet": {"favorites": data.point_id}})
    updated = await db.users.find_one({"_id": user["_id"]})
    return {"favorites": updated.get("favorites", [])}

@api_router.delete("/favorites/{point_id}")
async def remove_favorite(point_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$pull": {"favorites": point_id}})
    updated = await db.users.find_one({"_id": user["_id"]})
    return {"favorites": updated.get("favorites", [])}

@api_router.get("/")
async def root():
    return {"message": "Relay Dip API", "points": len(POINTS)}

# ---------------------------------------------------------------- Startup
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=3600)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@relaispoint.fr").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email, "password_hash": hash_password(admin_pw),
            "name": "Admin", "role": "admin", "favorites": [],
            "created_at": datetime.now(timezone.utc).isoformat()})
        logger.info("Admin créé: %s", admin_email)
    elif existing.get("role") != "admin":
        await db.users.update_one({"email": admin_email}, {"$set": {"role": "admin"}})
    # Charger les modifications admin en mémoire
    async for ov in db.point_overrides.find():
        _OVERRIDES[ov["point_id"]] = {
            k: ov[k] for k in _EDITABLE if k in ov
        }
    async for c in db.custom_points.find():
        c.pop("_id", None)
        _CUSTOM[c["id"]] = c
    async for d in db.deleted_points.find():
        _DELETED.add(d["point_id"])
    logger.info("Overrides: %d | Custom: %d | Deleted: %d",
                len(_OVERRIDES), len(_CUSTOM), len(_DELETED))

app.include_router(api_router)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown():
    client.close()
