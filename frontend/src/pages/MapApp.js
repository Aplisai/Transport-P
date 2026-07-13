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
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get("/carriers").then(({ data }) => setCarriers(data));
  }, []);

  const fetchPoints = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (active.size) params.carriers = [...active].join(",");
    if (query.trim()) params.q = query.trim();
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
  }, [active, query, userLoc]);

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
      toast.error("Géolocalisation non supportée");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(loc);
        setFlyTarget({ ...loc, zoom: 13 });
        setLocating(false);
        toast.success("Position détectée — points relais triés par distance");
      },
      () => {
        setLocating(false);
        toast.error("Impossible de récupérer votre position");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const selectPoint = (p) => {
    setSelected(p);
    setFlyTarget({ lat: p.lat, lng: p.lng, zoom: 15 });
    setSheetOpen(true);
  };

  const requireAuth = () => {
    toast.info("Connectez-vous pour enregistrer vos favoris");
    setShowAuth(true);
  };

  const visiblePoints =
    tab === "favorites" ? points.filter((p) => favorites.includes(p.id)) : points;

  const Panel = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/10 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-white p-1.5 text-black">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-head text-lg font-semibold leading-none tracking-tight">
                RelaisPoint
              </h1>
              <p className="text-[11px] text-white/40">Points relais de France</p>
            </div>
          </div>
          {user ? (
            <div className="flex items-center gap-2">
              <span
                className="hidden max-w-[90px] truncate text-xs text-white/60 sm:inline"
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
                className="rounded-full bg-white/5 p-2 hover:bg-white/10 transition-[background-color]"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              data-testid="open-auth-btn"
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-gray-200 transition-[background-color]"
            >
              <User className="h-3.5 w-3.5" />
              Se connecter
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            data-testid="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ville ou code postal…"
            className="w-full rounded-full bg-white/5 border border-white/10 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-white/30 focus:ring-2 focus:ring-white/20 transition-[border-color]"
          />
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1 rounded-full bg-black/40 p-1">
          <button
            data-testid="tab-all"
            onClick={() => setTab("all")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium transition-[background-color,color] ${
              tab === "all" ? "bg-white text-black" : "text-white/60 hover:text-white"
            }`}
          >
            <List className="h-3.5 w-3.5" /> Tous
          </button>
          <button
            data-testid="tab-favorites"
            onClick={() => (user ? setTab("favorites") : requireAuth())}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium transition-[background-color,color] ${
              tab === "favorites" ? "bg-white text-black" : "text-white/60 hover:text-white"
            }`}
          >
            <Heart className="h-3.5 w-3.5" /> Favoris
            {favorites.length > 0 && ` (${favorites.length})`}
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="border-b border-white/10 px-4 py-3">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-white/40">
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
                    : "border-white/20 bg-black/40 text-white/70 hover:border-white/50"
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
      <div className="rp-scroll flex-1 space-y-2 overflow-y-auto p-4">
        <div className="mb-1 flex items-center justify-between text-xs text-white/40">
          <span data-testid="results-count">{visiblePoints.length} points relais</span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </div>
        {visiblePoints.length === 0 && !loading && (
          <div className="py-10 text-center text-sm text-white/40" data-testid="empty-state">
            {tab === "favorites"
              ? "Aucun favori enregistré pour le moment."
              : "Aucun point relais trouvé."}
          </div>
        )}
        {visiblePoints.map((p, i) => (
          <PointCard
            key={p.id}
            point={p}
            index={i}
            active={selected?.id === p.id}
            onSelect={selectPoint}
            onRequireAuth={requireAuth}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0B0C10]">
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

      {/* Geolocation FAB */}
      <button
        onClick={geolocate}
        aria-label="Me géolocaliser"
        data-testid="geolocate-btn"
        className="absolute right-4 top-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-full bg-black/70 backdrop-blur-xl border border-white/10 text-white shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:bg-black/90 transition-[background-color] lg:right-6 lg:top-6"
      >
        {locating ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Crosshair className="h-5 w-5" />
        )}
      </button>

      {/* Desktop panel */}
      <aside className="absolute left-0 top-0 z-[1000] hidden h-full w-[400px] border-r border-white/10 bg-[#14161C]/95 backdrop-blur-xl lg:block">
        {Panel}
      </aside>

      {/* Mobile bottom sheet toggle */}
      <button
        onClick={() => setSheetOpen((s) => !s)}
        data-testid="sheet-toggle"
        className="absolute bottom-5 left-1/2 z-[1100] -translate-x-1/2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black shadow-[0_8px_32px_rgba(0,0,0,0.5)] lg:hidden"
      >
        {sheetOpen ? "Voir la carte" : `Liste (${visiblePoints.length})`}
      </button>

      {/* Mobile sheet */}
      <div
        className={`absolute inset-x-0 bottom-0 z-[1050] max-h-[82vh] rounded-t-2xl border-t border-white/10 bg-[#14161C] transition-transform duration-300 lg:hidden ${
          sheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
        data-testid="mobile-sheet"
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
          <button
            onClick={() => setSheetOpen(false)}
            aria-label="Fermer"
            className="absolute right-3 top-3 rounded-full bg-white/5 p-1.5"
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
