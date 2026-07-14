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
        if selected and p["carrier"] not in selected:
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
async def geocode(q: str):
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
    return {
        "lat": float(data[0]["lat"]),
        "lng": float(data[0]["lon"]),
        "label": data[0].get("display_name", q),
    }


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
