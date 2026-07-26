from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

import os
import math
import json
import re
import logging
import unicodedata
import secrets
import tempfile
import csv
import io
import uuid
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
from emergentintegrations.llm.chat import LlmChat, UserMessage

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
    photo: Optional[str] = None

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
    photo: Optional[str] = None

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
    return {"id": str(user["_id"]), "email": user["email"],
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
    return {**user_public(doc), "token": token}

@api_router.post("/auth/login")
async def login(data: LoginIn, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    token = create_access_token(str(user["_id"]), email)
    set_auth_cookie(response, token)
    return {**user_public(user), "token": token}

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

class ProfileIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    email: Optional[EmailStr] = None
    password: Optional[str] = None

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

@api_router.patch("/auth/profile")
async def update_profile(data: ProfileIn, user: dict = Depends(get_current_user)):
    if user.get("password_hash"):
        if not data.password or not verify_password(data.password, user["password_hash"]):
            raise HTTPException(status_code=400, detail="Mot de passe incorrect")
    updates = {}
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Le nom ne peut pas être vide")
        updates["name"] = name
    if data.email is not None:
        email = data.email.lower().strip()
        existing = await db.users.find_one({"email": email})
        if existing and str(existing["_id"]) != str(user["_id"]):
            raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
        updates["email"] = email
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    updated = await db.users.find_one({"_id": user["_id"]})
    return user_public(updated)

@api_router.delete("/auth/account")
async def delete_account(response: Response, user: dict = Depends(get_current_user)):
    await db.users.delete_one({"_id": user["_id"]})
    await db.password_reset_tokens.delete_many({"user_id": str(user["_id"])})
    response.delete_cookie("access_token", path="/")
    return {"ok": True, "message": "Compte supprimé."}

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


# ---- Statistiques (visites & installations) ----
def _today_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def _optional_user(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return await db.users.find_one({"_id": ObjectId(payload["sub"])})
    except Exception:
        return None


@api_router.post("/track/visit")
async def track_visit(request: Request):
    user = await _optional_user(request)
    field = "visits_auth" if user else "visits_anon"
    await db.stats_daily.update_one(
        {"date": _today_str()}, {"$inc": {"visits": 1, field: 1}}, upsert=True
    )
    return {"ok": True}


@api_router.post("/track/install")
async def track_install():
    await db.stats_daily.update_one({"date": _today_str()}, {"$inc": {"installs": 1}}, upsert=True)
    return {"ok": True}


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


@api_router.post("/reviews")
async def create_review(data: ReviewIn, user: dict = Depends(get_current_user)):
    doc = {
        "user_id": str(user["_id"]),
        "user_name": user.get("name", ""),
        "user_email": user.get("email", ""),
        "rating": data.rating,
        "comment": data.comment.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one(doc)
    return {"ok": True}


@api_router.get("/admin/reviews")
async def list_reviews(admin: dict = Depends(require_admin)):
    docs = await db.reviews.find().sort("created_at", -1).to_list(1000)
    out = [{
        "id": str(d["_id"]),
        "user_name": d.get("user_name", ""),
        "user_email": d.get("user_email", ""),
        "rating": d.get("rating", 0),
        "comment": d.get("comment", ""),
        "created_at": d.get("created_at", ""),
    } for d in docs]
    avg = round(sum(d["rating"] for d in out) / len(out), 1) if out else 0
    return {"reviews": out, "count": len(out), "average": avg}


@api_router.get("/admin/stats")
async def admin_stats(days: int = 30, admin: dict = Depends(require_admin)):
    docs = await db.stats_daily.find().to_list(1000)
    by_date = {d["date"]: d for d in docs}
    today = datetime.now(timezone.utc).date()
    out = []
    for i in range(days):
        d = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        rec = by_date.get(d, {})
        out.append({"date": d, "visits": rec.get("visits", 0), "installs": rec.get("installs", 0)})
    today_rec = by_date.get(_today_str(), {})
    return {
        "days": out,
        "total_visits": sum(d.get("visits", 0) for d in docs),
        "total_installs": sum(d.get("installs", 0) for d in docs),
        "today_visits": today_rec.get("visits", 0),
        "today_installs": today_rec.get("installs", 0),
        "today_visits_auth": today_rec.get("visits_auth", 0),
        "today_visits_anon": today_rec.get("visits_anon", 0),
        "registered_users": await db.users.count_documents({}),
        "visits_auth": sum(d.get("visits_auth", 0) for d in docs),
        "visits_anon": sum(d.get("visits_anon", 0) for d in docs),
    }


@api_router.get("/admin/users")
async def list_users(admin: dict = Depends(require_admin)):
    docs = await db.users.find().sort("created_at", -1).to_list(1000)
    out = [{
        "id": str(u["_id"]),
        "name": u.get("name", ""),
        "email": u.get("email", ""),
        "role": u.get("role", "user"),
        "created_at": u.get("created_at", ""),
        "favorites_count": len(u.get("favorites", []) or []),
    } for u in docs]
    return {"users": out, "count": len(out)}


# ---- Stockage d'objets (photos des points) ----
_STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
_APP_NAME = "relaydip"
_STORAGE_KEY = None
_IMG_MIME = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif"}


def init_storage():
    global _STORAGE_KEY
    if _STORAGE_KEY:
        return _STORAGE_KEY
    resp = requests.post(f"{_STORAGE_URL}/init",
                         json={"emergent_key": os.environ["EMERGENT_LLM_KEY"]}, timeout=30)
    resp.raise_for_status()
    _STORAGE_KEY = resp.json()["storage_key"]
    return _STORAGE_KEY


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{_STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 403:
        # clé expirée -> réinitialiser
        global _STORAGE_KEY
        _STORAGE_KEY = None
        key = init_storage()
        resp = requests.put(f"{_STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{_STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 403:
        global _STORAGE_KEY
        _STORAGE_KEY = None
        key = init_storage()
        resp = requests.get(f"{_STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


@api_router.post("/admin/upload-photo")
async def upload_photo(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    if ext not in _IMG_MIME:
        raise HTTPException(status_code=400, detail="Format d'image non supporté (jpg, png, webp)")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop volumineuse (max 8 Mo)")
    path = f"{_APP_NAME}/points/{uuid.uuid4().hex}.{ext}"
    content_type = _IMG_MIME[ext]
    try:
        result = put_object(path, data, content_type)
    except Exception as e:
        logger.warning("Upload photo error: %s", e)
        raise HTTPException(status_code=502, detail="Échec de l'envoi de l'image")
    stored_path = result["path"]
    await db.files.insert_one({
        "storage_path": stored_path,
        "content_type": content_type,
        "original_filename": file.filename,
        "size": result.get("size"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": f"/api/files/{stored_path}", "path": stored_path}


@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    record = await db.files.find_one({"storage_path": path})
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    ct = record.get("content_type") if record else content_type
    return Response(content=data, media_type=ct,
                    headers={"Cache-Control": "public, max-age=86400"})


# ---- Couche données administrateur (CRUD complet) ----
# _OVERRIDES: modifications de champs sur les points statiques
# _DELETED: ids de points statiques masqués
# _CUSTOM: points créés par l'admin (id -> doc)
_OVERRIDES = {}
_DELETED = set()
_CUSTOM = {}

_EDITABLE = ["name", "type", "carrier", "carriers", "address", "postal_code",
             "city", "phone", "lat", "lng", "hours", "photo"]


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


DAY_KEYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"]
_WEEKDAY_KEYS = ["lun", "mar", "mer", "jeu", "ven"]


def _normalize_hours(h):
    if not isinstance(h, dict):
        return {k: "" for k in DAY_KEYS}
    legacy = (h.get("lun-ven", "") or "").strip()
    out = {}
    for k in DAY_KEYS:
        v = (h.get(k, "") or "")
        v = v.strip() if isinstance(v, str) else ""
        if not v and legacy and k in _WEEKDAY_KEYS:
            v = legacy
        out[k] = v
    return out


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(default="", max_length=1000)
    link: str = Field(default="", max_length=500)


async def _add_notification(ntype: str, title: str, body: str = "", link: str = "", ref_id: str = ""):
    await db.notifications.insert_one({
        "type": ntype,
        "title": title,
        "body": body,
        "link": link,
        "ref_id": ref_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


@api_router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    docs = await db.notifications.find().sort("created_at", -1).to_list(50)
    read_at = user.get("notifications_read_at") or ""
    enabled = user.get("notifications_enabled", True)
    items = [{
        "id": str(d["_id"]),
        "type": d.get("type", "announcement"),
        "title": d.get("title", ""),
        "body": d.get("body", ""),
        "link": d.get("link", ""),
        "ref_id": d.get("ref_id", ""),
        "created_at": d.get("created_at", ""),
    } for d in docs]
    unread = 0 if not enabled else sum(1 for d in items if d["created_at"] > read_at)
    return {"notifications": items, "unread": unread, "enabled": enabled}


class NotifToggleIn(BaseModel):
    enabled: bool


@api_router.post("/notifications/toggle")
async def toggle_notifications(data: NotifToggleIn, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"notifications_enabled": data.enabled}},
    )
    return {"ok": True, "enabled": data.enabled}


@api_router.post("/notifications/read")
async def mark_notifications_read(user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"notifications_read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


@api_router.post("/admin/notifications")
async def create_announcement(data: AnnouncementIn, admin: dict = Depends(require_admin)):
    link = data.link.strip()
    if link and not link.startswith(("http://", "https://")):
        link = "https://" + link
    await _add_notification("announcement", data.title.strip(), data.body.strip(), link)
    return {"ok": True}


_DEFAULT_NOTICE = "Cher utilisateurs, c'est pour vous informer que d'autres points sont en cours d'ajout. Merci de votre visite."


class NoticeIn(BaseModel):
    text: str = Field(default="", max_length=1000)


@api_router.get("/notice")
async def get_notice():
    doc = await db.settings.find_one({"key": "banner"})
    if not doc:
        await db.settings.insert_one({"key": "banner", "text": _DEFAULT_NOTICE})
        return {"text": _DEFAULT_NOTICE}
    return {"text": doc.get("text", "")}


@api_router.post("/admin/notice")
async def set_notice(data: NoticeIn, admin: dict = Depends(require_admin)):
    text = data.text.strip()
    await db.settings.update_one({"key": "banner"}, {"$set": {"text": text}}, upsert=True)
    return {"ok": True, "text": text}


class ProposalIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(default="", max_length=250)
    type: str = Field(default="relais")
    carriers: List[str] = Field(default_factory=list)
    comment: str = Field(default="", max_length=1000)


@api_router.post("/proposals")
async def create_proposal(data: ProposalIn, user: dict = Depends(get_current_user)):
    ptype = data.type if data.type in ("relais", "locker") else "relais"
    valid_carriers = [c for c in data.carriers if c in CARRIERS][:20]
    await db.proposals.insert_one({
        "user_id": str(user["_id"]),
        "user_name": user.get("name", ""),
        "user_email": user.get("email", ""),
        "name": data.name.strip(),
        "address": data.address.strip(),
        "type": ptype,
        "carriers": valid_carriers,
        "comment": data.comment.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


@api_router.get("/admin/proposals")
async def list_proposals(admin: dict = Depends(require_admin)):
    docs = await db.proposals.find().sort("created_at", -1).to_list(500)
    items = [{
        "id": str(d["_id"]),
        "user_name": d.get("user_name", ""),
        "user_email": d.get("user_email", ""),
        "name": d.get("name", ""),
        "address": d.get("address", ""),
        "type": d.get("type", "relais"),
        "carriers": d.get("carriers", []),
        "comment": d.get("comment", ""),
        "created_at": d.get("created_at", ""),
    } for d in docs]
    return {"proposals": items, "count": len(items)}


@api_router.delete("/admin/proposals/{proposal_id}")
async def delete_proposal(proposal_id: str, admin: dict = Depends(require_admin)):
    try:
        await db.proposals.delete_one({"_id": ObjectId(proposal_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Identifiant invalide")
    return {"ok": True}


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
        "photo": data.photo or "",
        "custom": True,
    }
    await db.custom_points.update_one({"id": pid}, {"$set": point}, upsert=True)
    _CUSTOM[pid] = point
    await _add_notification("point", "Nouveau point ajouté", point["name"], ref_id=pid)
    return point


_CSV_COLUMNS = ["name", "type", "carriers", "address", "postal_code", "city", "lat", "lng",
                "phone", "hours_lun", "hours_mar", "hours_mer", "hours_jeu", "hours_ven",
                "hours_sam", "hours_dim"]


@api_router.get("/admin/points/export")
async def admin_export_points(admin: dict = Depends(require_admin)):
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(_CSV_COLUMNS)
    for p in _CUSTOM.values():
        h = p.get("hours", {}) or {}
        writer.writerow([
            p.get("name", ""), p.get("type", "relais"),
            "|".join(p.get("carriers", []) or []),
            p.get("address", ""), p.get("postal_code", ""), p.get("city", ""),
            p.get("lat", ""), p.get("lng", ""), p.get("phone", ""),
            h.get("lun", ""), h.get("mar", ""), h.get("mer", ""), h.get("jeu", ""),
            h.get("ven", ""), h.get("sam", ""), h.get("dim", ""),
        ])
    content = buf.getvalue()
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=points_relais.csv"},
    )


def _parse_csv_row(row):
    """Transforme une ligne CSV (dict) en objet point de prévisualisation + erreurs."""
    errors = []

    def g(k):
        return (row.get(k, "") or "").strip()

    name = g("name")
    if not name:
        errors.append("nom manquant")
    ptype = g("type").lower() or "relais"
    if ptype not in ("relais", "locker"):
        ptype = "relais"
    carriers = [c.strip() for c in re.split(r"[|,]", g("carriers")) if c.strip()]
    carriers = [c for c in carriers if c in CARRIERS]
    if not carriers:
        carriers = ["mondial_relay"]
    lat_s, lng_s = g("lat"), g("lng")
    lat = lng = None
    try:
        if lat_s:
            lat = float(lat_s.replace(",", "."))
        if lng_s:
            lng = float(lng_s.replace(",", "."))
    except ValueError:
        errors.append("coordonnées invalides")
    if lat is None or lng is None:
        errors.append("latitude/longitude requises")
    elif not (41.0 <= lat <= 51.5) or not (-5.8 <= lng <= 9.8):
        errors.append("coordonnées hors de France")
    hours = {
        "lun": g("hours_lun"), "mar": g("hours_mar"), "mer": g("hours_mer"),
        "jeu": g("hours_jeu"), "ven": g("hours_ven"), "sam": g("hours_sam"), "dim": g("hours_dim"),
    }
    return {
        "name": name, "type": ptype, "carriers": carriers,
        "address": g("address"), "postal_code": g("postal_code"), "city": g("city"),
        "lat": lat, "lng": lng, "phone": g("phone"), "hours": hours,
        "valid": len(errors) == 0, "errors": errors,
    }


@api_router.post("/admin/points/import-preview")
async def admin_import_preview(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="replace")
    # Détection du séparateur (; ou ,)
    sample = text[:2000]
    delim = ";" if sample.count(";") >= sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    rows = [_parse_csv_row(r) for r in reader]
    rows = rows[:500]
    return {"rows": rows, "count": len(rows), "valid_count": sum(1 for r in rows if r["valid"])}


class ImportCommitIn(BaseModel):
    points: List[PointFullIn]


@api_router.post("/admin/points/import-commit")
async def admin_import_commit(data: ImportCommitIn, admin: dict = Depends(require_admin)):
    created = 0
    for d in data.points:
        if d.lat is None or d.lng is None:
            continue
        if not (41.0 <= d.lat <= 51.5) or not (-5.8 <= d.lng <= 9.8):
            continue
        pid = f"cust-{secrets.token_hex(6)}"
        carriers = [c for c in (d.carriers or []) if c in CARRIERS] or ["mondial_relay"]
        carrier = carriers[0]
        cname, color = _carrier_fields(carrier)
        point = {
            "id": pid,
            "type": d.type or "relais",
            "carrier": carrier,
            "carrier_name": cname,
            "color": color,
            "carriers": carriers,
            "name": (d.name or "").strip() or "Nouveau point",
            "address": d.address or "",
            "postal_code": d.postal_code or "",
            "city": d.city or "",
            "lat": round(d.lat, 6),
            "lng": round(d.lng, 6),
            "phone": d.phone or "",
            "hours": _normalize_hours(d.hours),
            "photo": d.photo or "",
            "custom": True,
        }
        await db.custom_points.update_one({"id": pid}, {"$set": point}, upsert=True)
        _CUSTOM[pid] = point
        created += 1
    if created:
        await _add_notification("point", "Points importés", f"{created} point(s) ajouté(s) par import CSV")
    return {"ok": True, "created": created}


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
    if data.photo is not None:
        fields["photo"] = data.photo

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


class PointLookupIn(BaseModel):
    query: str = Field(min_length=1, max_length=300)


_OSM_DAY_MAP = {"Mo": "lun", "Tu": "mar", "We": "mer", "Th": "jeu", "Fr": "ven", "Sa": "sam", "Su": "dim"}
_OSM_DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]


def _fmt_osm_times(spec):
    spec = (spec or "").strip()
    low = spec.lower()
    if low in ("off", "closed"):
        return "Fermé"
    if low in ("24/7", "open"):
        return "24h/24"
    out = []
    for p in [x.strip() for x in spec.split(",") if x.strip()]:
        mt = re.match(r"^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$", p)
        if mt:
            out.append(f"{mt.group(1).zfill(2)}h{mt.group(2)} – {mt.group(3).zfill(2)}h{mt.group(4)}")
        else:
            out.append(p)
    return ", ".join(out)


def _parse_osm_hours(oh):
    res = {k: "" for k in DAY_KEYS}
    if not oh or not isinstance(oh, str):
        return res
    oh = oh.strip()
    if oh == "24/7":
        return {k: "24h/24" for k in DAY_KEYS}
    for rule in oh.split(";"):
        rule = rule.strip()
        if not rule:
            continue
        mt = re.match(r"^([A-Za-z,\- ]+?)\s+(.*)$", rule)
        if mt:
            daypart, timepart = mt.group(1).strip(), mt.group(2).strip()
        else:
            daypart, timepart = "Mo-Su", rule
        days = []
        for token in daypart.split(","):
            token = token.strip()
            rng = token.split("-")
            if len(rng) == 2 and rng[0] in _OSM_DAY_ORDER and rng[1] in _OSM_DAY_ORDER:
                i, j = _OSM_DAY_ORDER.index(rng[0]), _OSM_DAY_ORDER.index(rng[1])
                if i <= j:
                    days += _OSM_DAY_ORDER[i:j + 1]
            elif token in _OSM_DAY_ORDER:
                days.append(token)
        val = _fmt_osm_times(timepart)
        for d in days:
            res[_OSM_DAY_MAP[d]] = val
    return res


def _empty_lookup():
    return {"found": False, "name": "", "address": "", "postal_code": "", "city": "", "phone": "",
            "hours": {k: "" for k in DAY_KEYS}}


def _osm_lookup(q: str):
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": q, "format": "json", "countrycodes": "fr", "limit": 1,
                    "addressdetails": 1, "extratags": 1, "namedetails": 1},
            headers={"User-Agent": "RelayDip/1.0 (points relais France)"},
            timeout=10,
        )
        items = r.json()
    except Exception as e:
        logger.warning("OSM lookup error: %s", e)
        return _empty_lookup()
    if not items:
        return _empty_lookup()
    it = items[0]
    addr = it.get("address", {}) or {}
    extra = it.get("extratags", {}) or {}
    names = it.get("namedetails", {}) or {}
    road = addr.get("road") or addr.get("pedestrian") or addr.get("neighbourhood") or ""
    house = addr.get("house_number") or ""
    street = (f"{house} {road}".strip()) if road else ""
    postal = addr.get("postcode") or ""
    city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality") or ""
    dn = it.get("display_name") or ""
    name = names.get("name") or it.get("name") or extra.get("brand") or (dn.split(",")[0].strip() if dn else "")
    phone = extra.get("phone") or extra.get("contact:phone") or ""
    hours = _parse_osm_hours(extra.get("opening_hours", ""))
    found = bool(street or postal or city or phone or any(hours.values()))
    return {"found": found, "name": name, "address": street, "postal_code": postal,
            "city": city, "phone": phone, "hours": hours}


async def _ai_lookup(q: str):
    system_message = (
        "Tu es un assistant de recherche d'établissements en France (magasins, supermarchés, supérettes, "
        "commerces, enseignes, boutiques, restaurants, etc.), comme une simple recherche Google. "
        "Tu identifies le MAGASIN / l'ENSEIGNE recherché — jamais un « point relais ». "
        "Tu réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans markdown. "
        "Clés exactes: name, address, postal_code, city, phone, lun, mar, mer, jeu, ven, sam, dim, found. "
        "name = nom du magasin/enseigne. address = numéro et rue. postal_code = code postal à 5 chiffres. "
        "city = ville. phone = téléphone au format français. "
        "Chaque jour est au format « 09h00 – 19h00 » (tiret cadratin), « Fermé », ou « » (vide) si inconnu. "
        "found vaut true dès que tu identifies un établissement réel et précis. "
        "Pour l'adresse, le code postal et le téléphone : ne renseigne que si tu es raisonnablement sûr, sinon laisse vide, ne jamais inventer. "
        "Pour les HORAIRES : si tu connais l'établissement (ou son enseigne), fournis ses horaires d'ouverture HABITUELS des 7 jours (une estimation raisonnable est acceptée puisque l'utilisateur vérifiera et corrigera). Ne laisse les jours vides que si tu n'as vraiment aucune idée du type d'établissement."
    )
    prompt = (
        f"Recherche ce magasin / cette enseigne en France et donne ses informations : « {q} ». "
        "Réponds seulement avec le JSON demandé."
    )
    try:
        chat = LlmChat(
            api_key=os.environ["EMERGENT_LLM_KEY"],
            session_id=f"lookup-{uuid.uuid4().hex[:12]}",
            system_message=system_message,
        ).with_model("gemini", "gemini-3.1-pro-preview")
        raw = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.warning("AI lookup error: %s", e)
        return _empty_lookup()
    m = re.search(r"\{.*\}", (raw or "").strip(), re.DOTALL)
    if not m:
        return _empty_lookup()
    try:
        p = json.loads(m.group(0))
    except Exception:
        return _empty_lookup()
    hours = {k: (str(p.get(k, "") or "").strip()) for k in DAY_KEYS}
    return {
        "found": bool(p.get("found")),
        "name": str(p.get("name", "") or "").strip(),
        "address": str(p.get("address", "") or "").strip(),
        "postal_code": str(p.get("postal_code", "") or "").strip(),
        "city": str(p.get("city", "") or "").strip(),
        "phone": str(p.get("phone", "") or "").strip(),
        "hours": hours,
    }


@api_router.post("/admin/points/lookup")
async def admin_point_lookup(data: PointLookupIn, admin: dict = Depends(require_admin)):
    q = data.query.strip()
    if not q:
        return {**_empty_lookup(), "source": ""}
    # 1) OpenStreetMap (gratuit) d'abord — suffisant seulement s'il fournit les horaires
    osm = _osm_lookup(q)
    osm_ok = bool(osm["address"]) and any(osm["hours"].values())
    if osm_ok:
        return {**osm, "source": "openstreetmap"}
    # 2) Repli IA (Gemini) pour compléter, notamment les horaires/jours d'ouverture
    ai = await _ai_lookup(q)
    ai_has_info = ai["found"] or ai["address"] or ai["phone"] or any(ai["hours"].values())
    if ai_has_info:
        return {**ai, "source": "ia"}
    # 3) Rien de mieux : renvoyer ce qu'OSM avait éventuellement (adresse sans horaires)
    if osm["found"]:
        return {**osm, "source": "openstreetmap"}
    return {**_empty_lookup(), "source": ""}


def _osm_suggest_list(q, limit=6):
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": q, "format": "json", "countrycodes": "fr", "limit": limit,
                    "addressdetails": 1, "extratags": 1, "namedetails": 1},
            headers={"User-Agent": "RelayDip/1.0 (points relais France)"},
            timeout=10,
        )
        items = r.json()
    except Exception as e:
        logger.warning("OSM suggest error: %s", e)
        return []
    out = []
    for it in items if isinstance(items, list) else []:
        addr = it.get("address", {}) or {}
        extra = it.get("extratags", {}) or {}
        names = it.get("namedetails", {}) or {}
        road = addr.get("road") or addr.get("pedestrian") or addr.get("neighbourhood") or ""
        house = addr.get("house_number") or ""
        street = (f"{house} {road}".strip()) if road else ""
        postal = addr.get("postcode") or ""
        city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality") or ""
        dn = it.get("display_name") or ""
        name = names.get("name") or it.get("name") or extra.get("brand") or (dn.split(",")[0].strip() if dn else "")
        if not name:
            continue
        phone = extra.get("phone") or extra.get("contact:phone") or ""
        hours = _parse_osm_hours(extra.get("opening_hours", ""))
        out.append({
            "name": name, "address": street, "postal_code": postal,
            "city": city, "phone": phone, "hours": hours, "source": "openstreetmap",
        })
    return out


async def _ai_suggest_list(q, limit=6):
    system_message = (
        "Tu es un assistant de recherche d'établissements et enseignes en France (magasins, supérettes, "
        "tabacs, fleuristes, pharmacies, boulangeries, restaurants, etc.). À partir d'une requête, tu listes "
        "les établissements RÉELS et connus qui correspondent le mieux. "
        "Tu réponds UNIQUEMENT avec un JSON valide, sans texte ni markdown, de la forme "
        '{"suggestions":[{"name":"","address":"","postal_code":"","city":"","phone":"",'
        '"lun":"","mar":"","mer":"","jeu":"","ven":"","sam":"","dim":""}]}. '
        f"Maximum {limit} résultats, triés du plus pertinent au moins pertinent. "
        "name=nom de l'enseigne, address=numéro et rue, postal_code=5 chiffres, city=ville, phone=téléphone FR. "
        "Horaires au format « 09h00 – 19h00 », « Fermé », ou « » (vide) si inconnu. "
        "Ne renseigne adresse/code postal/téléphone que si tu es raisonnablement sûr ; sinon laisse vide. "
        "Ne jamais inventer une adresse précise fausse. Si aucun établissement pertinent, renvoie une liste vide."
    )
    prompt = f"Requête de recherche : « {q} ». Liste les enseignes/établissements réels correspondants en France."
    try:
        chat = LlmChat(
            api_key=os.environ["EMERGENT_LLM_KEY"],
            session_id=f"suggest-{uuid.uuid4().hex[:12]}",
            system_message=system_message,
        ).with_model("gemini", "gemini-3.1-pro-preview")
        raw = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.warning("AI suggest error: %s", e)
        return []
    m = re.search(r"\{.*\}", (raw or "").strip(), re.DOTALL)
    if not m:
        return []
    try:
        data = json.loads(m.group(0))
    except Exception:
        return []
    out = []
    for s in data.get("suggestions", []) if isinstance(data, dict) else []:
        name = str(s.get("name", "") or "").strip()
        if not name:
            continue
        hours = {k: (str(s.get(k, "") or "").strip()) for k in DAY_KEYS}
        out.append({
            "name": name,
            "address": str(s.get("address", "") or "").strip(),
            "postal_code": str(s.get("postal_code", "") or "").strip(),
            "city": str(s.get("city", "") or "").strip(),
            "phone": str(s.get("phone", "") or "").strip(),
            "hours": hours,
            "source": "ia",
        })
    return out


@api_router.get("/admin/points/suggest")
def admin_point_suggest(q: str, admin: dict = Depends(require_admin)):
    q = (q or "").strip()
    if len(q) < 3:
        return {"suggestions": []}
    # Option C : suggestions via OpenStreetMap uniquement (100% gratuit)
    out = _osm_suggest_list(q, limit=8)
    for s in out:
        loc = ", ".join([p for p in [s["address"], s["postal_code"], s["city"]] if p])
        s["label"] = f"{s['name']} — {loc}" if loc else s["name"]
    return {"suggestions": out}


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
    return [p for p in _effective_points() if p["id"] in fav_ids]

@api_router.post("/favorites")
async def add_favorite(data: FavoriteIn, user: dict = Depends(get_current_user)):
    if not any(p["id"] == data.point_id for p in _effective_points()):
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
    try:
        init_storage()
        logger.info("Stockage d'objets initialisé")
    except Exception as e:
        logger.error("Init stockage échouée: %s", e)
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
    async for ov in db.point_overrides.find().limit(50000):
        _OVERRIDES[ov["point_id"]] = {
            k: ov[k] for k in _EDITABLE if k in ov
        }
    async for c in db.custom_points.find().limit(50000):
        c.pop("_id", None)
        _CUSTOM[c["id"]] = c
    async for d in db.deleted_points.find().limit(50000):
        _DELETED.add(d["point_id"])
    logger.info("Overrides: %d | Custom: %d | Deleted: %d",
                len(_OVERRIDES), len(_CUSTOM), len(_DELETED))

app.include_router(api_router)
app.add_middleware(GZipMiddleware, minimum_size=1000)
_CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=None if _CORS_ORIGINS else ".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown():
    client.close()
