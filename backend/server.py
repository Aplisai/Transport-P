from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

import os
import math
import logging
import unicodedata
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
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, BeforeValidator, ConfigDict

from relay_data import POINTS, CARRIERS

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
    res = []
    for loc in _LOCS:
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
    for p in POINTS:
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
            item["distance"] = haversine(lat, lng, p["lat"], p["lng"])
        results.append(item)
    if lat is not None and lng is not None:
        results.sort(key=lambda x: x.get("distance", 9999))
    return results[:limit]

@api_router.get("/geocode")
def geocode(q: str):
    if not q or not q.strip():
        return {"lat": None}
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
        raise HTTPException(status_code=502, detail="Service de géocodage indisponible")
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



@api_router.get("/points/{point_id}")
async def get_point(point_id: str):
    for p in POINTS:
        if p["id"] == point_id:
            return p
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
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@relaispoint.fr").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email, "password_hash": hash_password(admin_pw),
            "name": "Admin", "role": "admin", "favorites": [],
            "created_at": datetime.now(timezone.utc).isoformat()})
        logger.info("Admin créé: %s", admin_email)
    elif not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_pw)}})

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
