"""Intégration officielle du web service Mondial Relay (WSI4_PointRelais_Recherche)."""
import os
import hashlib
import logging
from functools import lru_cache

from zeep import Client
from zeep.helpers import serialize_object

logger = logging.getLogger(__name__)

WSDL = os.environ.get("MR_WSDL", "https://api.mondialrelay.com/Web_Services.asmx?WSDL")
ENSEIGNE = os.environ.get("MR_ENSEIGNE", "")
PRIVATE_KEY = os.environ.get("MR_PRIVATE_KEY", "")

_ORDER = [
    "Enseigne", "Pays", "NumPointRelais", "Ville", "CP", "Latitude", "Longitude",
    "Taille", "Poids", "Action", "DelaiEnvoi", "RayonRecherche", "TypeActivite",
    "NombreResultats",
]

# Messages d'erreur STAT Mondial Relay les plus fréquents
STAT_MESSAGES = {
    "95": "Compte Mondial Relay non activé pour cette API. Fournissez vos identifiants marchands activés.",
    "97": "Clé de sécurité invalide (vérifiez la clé privée Mondial Relay).",
    "92": "Format de la clé de sécurité incorrect.",
    "9": "Enseigne non autorisée.",
}


@lru_cache(maxsize=1)
def _client() -> Client:
    return Client(WSDL)


def _security(params: dict) -> str:
    concat = "".join(params[k] for k in _ORDER) + PRIVATE_KEY
    return hashlib.md5(concat.encode("utf-8")).hexdigest().upper()


def _fmt_day(day_obj) -> str:
    """Convertit {'string': ['0900','1200','1400','1900']} en '09:00-12:00, 14:00-19:00'."""
    if not day_obj:
        return "Fermé"
    vals = day_obj.get("string") if isinstance(day_obj, dict) else day_obj
    if not vals:
        return "Fermé"
    vals = [v for v in vals if v and v != "0000"]
    if not vals:
        return "Fermé"
    ranges = []
    for i in range(0, len(vals) - 1, 2):
        a, b = vals[i], vals[i + 1]
        ranges.append(f"{a[:2]}:{a[2:]}-{b[:2]}:{b[2:]}")
    return ", ".join(ranges) if ranges else "Fermé"


def _to_str(v) -> str:
    return "" if v is None else str(v)


def search(ville="", cp="", lat=None, lng=None, action="24R", radius=20, nb=30):
    if not ENSEIGNE or not PRIVATE_KEY:
        return {"stat": None, "points": [], "message": "Identifiants Mondial Relay non configurés."}

    params = {
        "Enseigne": ENSEIGNE,
        "Pays": "FR",
        "NumPointRelais": "",
        "Ville": ville or "",
        "CP": cp or "",
        "Latitude": f"{lat:.6f}" if lat is not None else "",
        "Longitude": f"{lng:.6f}" if lng is not None else "",
        "Taille": "",
        "Poids": "",
        "Action": action,
        "DelaiEnvoi": "0",
        "RayonRecherche": str(radius),
        "TypeActivite": "",
        "NombreResultats": str(min(nb, 30)),
    }
    params["Security"] = _security(params)

    try:
        raw = _client().service.WSI4_PointRelais_Recherche(**params)
        obj = serialize_object(raw) or {}
    except Exception as e:  # noqa: BLE001
        logger.warning("Mondial Relay WS error: %s", e)
        return {"stat": "ERR", "points": [], "message": "Service Mondial Relay indisponible."}

    stat = _to_str(obj.get("STAT"))
    if stat != "0":
        return {"stat": stat, "points": [],
                "message": STAT_MESSAGES.get(stat, f"Erreur Mondial Relay (STAT {stat}).")}

    container = obj.get("PointsRelais") or {}
    details = container.get("PointRelais_Details") if isinstance(container, dict) else container
    if details is None:
        details = []
    if isinstance(details, dict):
        details = [details]

    points = []
    for d in details:
        if not isinstance(d, dict):
            continue
        lat_s = _to_str(d.get("Latitude")).replace(",", ".")
        lng_s = _to_str(d.get("Longitude")).replace(",", ".")
        try:
            plat, plng = float(lat_s), float(lng_s)
        except ValueError:
            continue
        num = _to_str(d.get("Num")).strip()
        name = _to_str(d.get("LgAdr1")).strip() or "Point Relais Mondial Relay"
        addr_parts = [_to_str(d.get("LgAdr3")).strip(), _to_str(d.get("LgAdr4")).strip()]
        address = ", ".join(p for p in addr_parts if p) or "Adresse non communiquée"
        is_locker = "locker" in name.lower() or "consigne" in name.lower()
        points.append({
            "id": f"mr-{num}",
            "type": "locker" if is_locker else "relais",
            "carrier": "mondial_relay",
            "carrier_name": "Mondial Relay",
            "color": "#FF3366",
            "carriers": ["mondial_relay"],
            "name": name,
            "address": address,
            "postal_code": _to_str(d.get("CP")).strip(),
            "city": _to_str(d.get("Ville")).strip(),
            "lat": round(plat, 6),
            "lng": round(plng, 6),
            "hours": {
                "lun-ven": _fmt_day(d.get("Horaires_Lundi")),
                "sam": _fmt_day(d.get("Horaires_Samedi")),
                "dim": _fmt_day(d.get("Horaires_Dimanche")),
            },
            "phone": "",
        })
    return {"stat": "0", "points": points, "message": ""}
