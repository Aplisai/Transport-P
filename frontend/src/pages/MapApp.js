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
  MapPin,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import MapView from "@/components/MapView";
import PointCard from "@/components/PointCard";
import PointDetail from "@/components/PointDetail";
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
  const [radius, setRadius] = useState(20); // km, 5-200
  const [address, setAddress] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const suggestRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get("/carriers").then(({ data }) => setCarriers(data));
  }, []);

  const fetchPoints = useCallback(async () => {
    if (liveMode) {
      if (!query.trim() && !userLoc) {
        setPoints([]);
        setLiveMessage("Recherchez une ville/code postal ou activez « Ma position » pour charger les points réels.");
        return;
      }
      setLoading(true);
      setLiveMessage("");
      const params = { radius: Math.min(radius, 25) };
      if (query.trim()) params.q = query.trim();
      if (userLoc) {
        params.lat = userLoc.lat;
        params.lng = userLoc.lng;
      }
      if (active.size) params.carriers = [...active].join(",");
      if (ptype !== "all") params.ptype = ptype;
      try {
        const { data } = await api.get("/live/points", { params });
        setPoints(data.points || []);
        if (data.center) setFlyTarget({ ...data.center, zoom: 12 });
        if (data.message) setLiveMessage(data.message);
        else if (!data.points?.length) setLiveMessage("Aucun point relais réel trouvé dans cette zone.");
      } catch {
        setPoints([]);
        setLiveMessage("Service OpenStreetMap momentanément indisponible. Réessayez.");
      } finally {
        setLoading(false);
      }
      return;
    }
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
  }, [active, query, userLoc, ptype, liveMode, radius]);

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

  const geocodeAddress = async (e) => {
    if (e) e.preventDefault();
    if (!address.trim()) return;
    setGeocoding(true);
    try {
      const { data } = await api.get("/geocode", { params: { q: address.trim() } });
      if (data.lat != null) {
        const loc = { lat: data.lat, lng: data.lng };
        setUserLoc(loc);
        setFlyTarget({ ...loc, zoom: 13 });
        setTab("nearby");
        toast.success("Adresse localisée — points relais triés par distance");
      } else {
        toast.error("Adresse introuvable en France");
      }
    } catch {
      toast.error("Impossible de localiser cette adresse");
    } finally {
      setGeocoding(false);
    }
  };

  const selectPoint = useCallback((p) => {
    setSelected(p);
    setFlyTarget({ lat: p.lat, lng: p.lng, zoom: 15 });
    setSheetOpen(true);
  }, []);

  const runSearch = async (overrideQ, flyTo) => {
    setTab("all");
    setShowSuggest(false);
    const qv = overrideQ !== undefined ? overrideQ : query;
    if (overrideQ !== undefined) setQuery(overrideQ);
    if (flyTo) setFlyTarget({ lat: flyTo.lat, lng: flyTo.lng, zoom: 12 });
    if (liveMode) {
      // en mode réel, le fetch (débounce) se déclenche via le changement de query
      return;
    }
    setLoading(true);
    const params = {};
    if (active.size) params.carriers = [...active].join(",");
    if (qv.trim()) params.q = qv.trim();
    if (ptype !== "all") params.ptype = ptype;
    if (userLoc) {
      params.lat = userLoc.lat;
      params.lng = userLoc.lng;
    }
    try {
      const { data } = await api.get("/points", { params });
      setPoints(data);
      if (flyTo) {
        setSheetOpen(true);
      } else if (qv.trim() && data.length) {
        setFlyTarget({ lat: data[0].lat, lng: data[0].lng, zoom: 12 });
        setSheetOpen(true);
      } else if (qv.trim() && !data.length) {
        toast.info("Aucun point relais trouvé pour cette recherche");
      }
    } finally {
      setLoading(false);
    }
  };

  const onQueryChange = (v) => {
    setQuery(v);
    if (v.trim() && tab !== "all") setTab("all");
    if (suggestRef.current) clearTimeout(suggestRef.current);
    if (v.trim().length >= 1) {
      suggestRef.current = setTimeout(async () => {
        try {
          const { data } = await api.get("/suggest", { params: { q: v.trim() } });
          setSuggestions(data);
          setShowSuggest(true);
        } catch {
          setSuggestions([]);
        }
      }, 180);
    } else {
      setSuggestions([]);
      setShowSuggest(false);
    }
  };

  const pickSuggestion = (s) => {
    setQuery(s.city);
    setShowSuggest(false);
    runSearch(s.city, { lat: s.lat, lng: s.lng });
  };

  const requireAuth = useCallback(() => {
    toast.info("Connectez-vous pour enregistrer vos favoris");
    setShowAuth(true);
  }, []);

  const withinRadius = userLoc
    ? points.filter((p) => p.distance != null && p.distance <= radius)
    : [];

  const visiblePoints =
    tab === "favorites"
      ? points.filter((p) => favorites.includes(p.id))
      : tab === "nearby"
      ? withinRadius
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
              <p className="text-[11px] text-gray-400">Trouver mon point relais ou locker</p>
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              data-testid="search-input"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => suggestions.length && setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              autoComplete="off"
              placeholder="Ville ou code postal…"
              className="w-full rounded-full bg-black/[0.03] border border-black/10 py-2.5 pl-9 pr-4 text-sm text-[#14161C] outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10 transition-[border-color]"
            />
            {showSuggest && (
              <div
                data-testid="search-suggestions"
                className="absolute left-0 right-0 top-full z-[1200] mt-2 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.15)]"
              >
                <button
                  type="button"
                  data-testid="suggest-my-position"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowSuggest(false);
                    geolocate();
                  }}
                  className="flex w-full items-center gap-2.5 border-b border-black/5 px-4 py-2.5 text-left text-sm text-[#14161C] hover:bg-black/[0.03] transition-[background-color]"
                >
                  <Crosshair className="h-4 w-4 text-[#14161C]" />
                  <span className="font-medium">Ma position (autour de moi)</span>
                </button>
                {suggestions.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-400">
                    Aucune ville ou code postal correspondant
                  </p>
                ) : (
                  suggestions.map((s) => (
                    <button
                      key={`${s.city}-${s.postal_code}`}
                      type="button"
                      data-testid={`suggest-item-${s.postal_code}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickSuggestion(s);
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-black/[0.03] transition-[background-color]"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="text-[#14161C]">{s.city}</span>
                      <span className="ml-auto text-xs text-gray-400">{s.postal_code}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="submit"
            data-testid="search-btn"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#14161C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2a2d36] transition-[background-color]"
          >
            <Search className="h-4 w-4" />
            Trouver
          </button>
        </form>

        {/* Data source toggle: Démo / Réel */}
        <div className="mt-3 flex items-center justify-between gap-2 rounded-full bg-black/5 p-1">
          <button
            data-testid="mode-demo"
            onClick={() => {
              setLiveMode(false);
              setLiveMessage("");
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium transition-[background-color,color] ${
              !liveMode ? "bg-[#14161C] text-white" : "text-gray-500 hover:text-[#14161C]"
            }`}
          >
            <Box className="h-3.5 w-3.5" /> Démo (France)
          </button>
          <button
            data-testid="mode-live"
            onClick={() => {
              setLiveMode(true);
              setPoints([]);
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium transition-[background-color,color] ${
              liveMode ? "bg-[#00E676] text-[#0B0C10]" : "text-gray-500 hover:text-[#14161C]"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" /> Réel (OpenStreetMap)
          </button>
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
              ? userLoc
                ? `${visiblePoints.length} point${visiblePoints.length > 1 ? "s" : ""} dans un rayon de ${radius} km`
                : "Choisissez votre point de départ"
              : `${visiblePoints.length} point${visiblePoints.length > 1 ? "s" : ""} relais`}
          </span>
          {(loading || geocoding) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </div>

        {liveMode && (
          <div
            data-testid="live-banner"
            className="mb-3 flex items-start gap-2 rounded-xl border border-[#00E676]/40 bg-[#00E676]/10 px-3 py-2.5 text-xs text-[#14161C]"
          >
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00A152]" />
            <span>
              <b>Données réelles (OpenStreetMap).</b> {liveMessage || "Points relais et lockers réels autour du lieu recherché (rayon max 25 km)."}
            </span>
          </div>
        )}

        {tab === "nearby" && (
          <div
            className="mb-3 space-y-3 rounded-xl border border-black/10 bg-white p-3"
            data-testid="nearby-controls"
          >
            <button
              onClick={geolocate}
              data-testid="nearby-locate-btn"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#14161C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2a2d36] transition-[background-color]"
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="h-4 w-4" />
              )}
              Ma position (GPS)
            </button>

            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span className="h-px flex-1 bg-black/10" />
              ou une adresse
              <span className="h-px flex-1 bg-black/10" />
            </div>

            <form onSubmit={geocodeAddress} className="flex gap-2">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                data-testid="nearby-address-input"
                placeholder="Ex : 10 rue de Rivoli, Paris"
                className="min-w-0 flex-1 rounded-full bg-black/[0.03] border border-black/10 px-3 py-2 text-xs text-[#14161C] outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10 transition-[border-color]"
              />
              <button
                type="submit"
                data-testid="nearby-address-btn"
                className="shrink-0 rounded-full bg-[#14161C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2a2d36] transition-[background-color]"
              >
                {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : "OK"}
              </button>
            </form>

            {userLoc && (
              <div data-testid="radius-control" className="pt-1">
                <div className="mb-1 flex items-center justify-between text-xs text-[#14161C]">
                  <span className="font-medium">Rayon de recherche</span>
                  <span data-testid="radius-value" className="font-semibold">
                    {radius} km
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={200}
                  step={5}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  data-testid="radius-slider"
                  className="w-full accent-[#14161C]"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>5 km</span>
                  <span>200 km</span>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "nearby" && userLoc && visiblePoints.length === 0 && !loading && (
          <div className="py-8 text-center text-sm text-gray-400" data-testid="nearby-empty">
            Aucun point relais dans un rayon de {radius} km. Élargissez le rayon.
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
      {selected && (
        <PointDetail
          point={selected}
          carriersInfo={carriers}
          onClose={() => setSelected(null)}
          onRequireAuth={requireAuth}
        />
      )}
    </div>
  );
}
