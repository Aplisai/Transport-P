import { useEffect, useState, useCallback, useRef } from "react";
import {
  Package,
  Search,
  Crosshair,
  User,
  LogOut,
  Heart,
  List,
  X,
  Loader2,
  Store,
  Box,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MapView from "@/components/MapView";
import PointCard from "@/components/PointCard";
import AuthModal from "@/components/AuthModal";
import { toast } from "sonner";

export default function MapApp() {
  const { user, favorites, logout } = useAuth();
  const [carriers, setCarriers] = useState([]);
  const [active, setActive] = useState(new Set());
  const [query, setQuery] = useState("");
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [userLoc, setUserLoc] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [tab, setTab] = useState("all"); // all | favorites
  const [sheetOpen, setSheetOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [ptype, setPtype] = useState("all"); // all | relais | locker
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get("/carriers").then(({ data }) => setCarriers(data));
  }, []);

  const fetchPoints = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (active.size) params.carriers = [...active].join(",");
    if (query.trim()) params.q = query.trim();
    if (ptype !== "all") params.ptype = ptype;
    if (userLoc) {
      params.lat = userLoc.lat;
      params.lng = userLoc.lng;
    }
    try {
      const { data } = await api.get("/points", { params });
      setPoints(data);
    } finally {
      setLoading(false);
    }
  }, [active, query, userLoc, ptype]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchPoints, 300);
    return () => clearTimeout(debounceRef.current);
  }, [fetchPoints]);

  const toggleCarrier = (id) => {
    setActive((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const geolocate = () => {
    if (!navigator.geolocation) {
      toast.error("Géolocalisation non supportée par ce navigateur");
      return;
    }
    if (window.isSecureContext === false) {
      toast.error("La géolocalisation nécessite une connexion sécurisée (HTTPS)");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const inFrance =
          loc.lat >= 41.0 && loc.lat <= 51.5 && loc.lng >= -5.8 && loc.lng <= 9.8;
        setLocating(false);
        if (!inFrance) {
          toast.error("Position hors de France — seule la France est prise en charge");
          setFlyTarget({ lat: 46.6, lng: 2.4, zoom: 6 });
          return;
        }
        setUserLoc(loc);
        setFlyTarget({ ...loc, zoom: 13 });
        setTab("nearby");
        toast.success("Position détectée — points relais triés par distance");
      },
      (err) => {
        setLocating(false);
        let msg = "Impossible de récupérer votre position";
        if (err.code === err.PERMISSION_DENIED)
          msg = "Accès à la position refusé. Autorisez la géolocalisation dans votre navigateur.";
        else if (err.code === err.POSITION_UNAVAILABLE)
          msg = "Position indisponible pour le moment. Réessayez.";
        else if (err.code === err.TIMEOUT)
          msg = "Délai dépassé. Vérifiez votre connexion et réessayez.";
        toast.error(msg);
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
    );
  };

  const selectPoint = useCallback((p) => {
    setSelected(p);
    setFlyTarget({ lat: p.lat, lng: p.lng, zoom: 15 });
    setSheetOpen(true);
  }, []);

  const requireAuth = useCallback(() => {
    toast.info("Connectez-vous pour enregistrer vos favoris");
    setShowAuth(true);
  }, []);

  const nearestByCarrier = userLoc
    ? carriers
        .map((c) => points.find((p) => p.carrier === c.id && p.distance != null))
        .filter(Boolean)
    : [];

  const visiblePoints =
    tab === "favorites"
      ? points.filter((p) => favorites.includes(p.id))
      : tab === "nearby"
      ? nearestByCarrier
      : points;
  const listPoints = visiblePoints.slice(0, 300);

  const Panel = (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="border-b border-black/10 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 items-center justify-center gap-0.5 rounded-lg bg-[#FFCC00] px-1.5">
              <span className="font-head text-base font-bold leading-none text-[#3399FF]">R</span>
              <Package className="h-3.5 w-3.5 text-black" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-head text-lg font-semibold leading-none tracking-tight text-[#14161C]">
                Relay Dip
              </h1>
              <p className="text-[11px] text-gray-400">Points relais de France</p>
            </div>
          </div>
          {user ? (
            <div className="flex items-center gap-2">
              <span
                className="hidden max-w-[90px] truncate text-xs text-gray-500 sm:inline"
                data-testid="user-name"
              >
                {user.name}
              </span>
              <button
                onClick={() => {
                  logout();
                  setTab("all");
                }}
                aria-label="Déconnexion"
                data-testid="logout-btn"
                className="rounded-full bg-black/5 p-2 hover:bg-black/10 transition-[background-color]"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              data-testid="open-auth-btn"
              className="flex items-center gap-1.5 rounded-full bg-[#14161C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2a2d36] transition-[background-color]"
            >
              <User className="h-3.5 w-3.5" />
              Se connecter
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            data-testid="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ville ou code postal…"
            className="w-full rounded-full bg-black/[0.03] border border-black/10 py-2.5 pl-9 pr-4 text-sm text-[#14161C] outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10 transition-[border-color]"
          />
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1 rounded-full bg-black/5 p-1">
          <button
            data-testid="tab-all"
            onClick={() => setTab("all")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium transition-[background-color,color] ${
              tab === "all"
                ? "bg-[#14161C] text-white"
                : "text-gray-500 hover:text-[#14161C]"
            }`}
          >
            <List className="h-3.5 w-3.5" /> Tous
          </button>
          <button
            data-testid="tab-nearby"
            onClick={() => setTab("nearby")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium transition-[background-color,color] ${
              tab === "nearby"
                ? "bg-[#14161C] text-white"
                : "text-gray-500 hover:text-[#14161C]"
            }`}
          >
            <Crosshair className="h-3.5 w-3.5" /> Près de moi
          </button>
          <button
            data-testid="tab-favorites"
            onClick={() => (user ? setTab("favorites") : requireAuth())}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium transition-[background-color,color] ${
              tab === "favorites"
                ? "bg-[#14161C] text-white"
                : "text-gray-500 hover:text-[#14161C]"
            }`}
          >
            <Heart className="h-3.5 w-3.5" /> Favoris
            {favorites.length > 0 && ` (${favorites.length})`}
          </button>
        </div>
      </div>

      {/* Type filter */}
      <div className="border-b border-black/10 px-4 py-3">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-gray-400">
          Type de point
        </p>
        <div className="flex gap-1 rounded-full bg-black/5 p-1">
          {[
            { id: "all", label: "Tous", icon: List },
            { id: "relais", label: "Points relais", icon: Store },
            { id: "locker", label: "Lockers", icon: Box },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                data-testid={`type-filter-${t.id}`}
                onClick={() => setPtype(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium transition-[background-color,color] ${
                  ptype === t.id
                    ? "bg-[#14161C] text-white"
                    : "text-gray-500 hover:text-[#14161C]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter chips */}
      <div className="border-b border-black/10 px-4 py-3">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-gray-400">
          Transporteurs
        </p>
        <div className="flex flex-wrap gap-2">
          {carriers.map((c) => {
            const on = active.has(c.id);
            return (
              <button
                key={c.id}
                data-testid={`carrier-filter-${c.id}`}
                onClick={() => toggleCarrier(c.id)}
                style={on ? { background: c.color, borderColor: c.color, color: "#0B0C10" } : {}}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-[background-color,border-color,color] ${
                  on
                    ? "font-semibold"
                    : "border-black/15 bg-white text-gray-600 hover:border-black/40"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: on ? "#0B0C10" : c.color }}
                />
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="rp-scroll flex-1 space-y-2 overflow-y-auto bg-[#F5F6F8] p-4">
        <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
          <span data-testid="results-count">
            {tab === "nearby"
              ? "Le plus proche par transporteur"
              : `${visiblePoints.length} point${visiblePoints.length > 1 ? "s" : ""} relais`}
          </span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </div>

        {tab === "nearby" && !userLoc && !loading && (
          <div className="py-10 text-center" data-testid="nearby-prompt">
            <p className="mb-3 text-sm text-gray-500">
              Activez votre position pour voir le point relais le plus proche de chaque transporteur.
            </p>
            <button
              onClick={geolocate}
              data-testid="nearby-locate-btn"
              className="inline-flex items-center gap-2 rounded-full bg-[#14161C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2a2d36] transition-[background-color]"
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="h-4 w-4" />
              )}
              Ma position
            </button>
          </div>
        )}

        {visiblePoints.length === 0 && tab !== "nearby" && !loading && (
          <div className="py-10 text-center text-sm text-gray-400" data-testid="empty-state">
            {tab === "favorites"
              ? "Aucun favori enregistré pour le moment."
              : "Aucun point relais trouvé."}
          </div>
        )}
        {listPoints.map((p, i) => (
          <PointCard
            key={p.id}
            point={p}
            index={i}
            active={selected?.id === p.id}
            onSelect={selectPoint}
            onRequireAuth={requireAuth}
          />
        ))}
        {tab !== "nearby" && visiblePoints.length > listPoints.length && (
          <p className="py-3 text-center text-xs text-gray-400" data-testid="list-truncation-note">
            {listPoints.length} premiers affichés — affinez avec la recherche ou les filtres
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#EEF1F5]">
      {/* Map */}
      <div className="absolute inset-0">
        <MapView
          points={visiblePoints}
          selectedId={selected?.id}
          userLocation={userLoc}
          flyTarget={flyTarget}
          onSelect={selectPoint}
        />
      </div>

      {/* Desktop panel */}
      <aside className="absolute left-0 top-0 z-[1000] hidden h-full w-[400px] border-r border-black/10 bg-white shadow-[8px_0_32px_rgba(0,0,0,0.06)] lg:block">
        {Panel}
      </aside>

      {/* Mobile bottom sheet toggle */}
      <button
        onClick={() => setSheetOpen((s) => !s)}
        data-testid="sheet-toggle"
        className="absolute bottom-5 left-1/2 z-[1100] -translate-x-1/2 rounded-full bg-[#14161C] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)] lg:hidden"
      >
        {sheetOpen ? "Voir la carte" : `Liste (${visiblePoints.length})`}
      </button>

      {/* Mobile sheet */}
      <div
        className={`absolute inset-x-0 bottom-0 z-[1050] max-h-[82vh] rounded-t-2xl border-t border-black/10 bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.12)] transition-transform duration-300 lg:hidden ${
          sheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
        data-testid="mobile-sheet"
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-black/15" />
          <button
            onClick={() => setSheetOpen(false)}
            aria-label="Fermer"
            className="absolute right-3 top-3 rounded-full bg-black/5 p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-[76vh]">{Panel}</div>
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
