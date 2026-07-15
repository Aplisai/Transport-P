import { useState } from "react";
import { X, MapPin, Clock, Phone, Navigation2, Heart, Locate, Box, Store, Pencil, Trash2, Loader2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const CODES = {
  mondial_relay: "MR",
  chronopost: "CH",
  la_poste: "LP",
  dpd: "DPD",
  ups: "UPS",
  relais_colis: "RC",
  colis_prive: "CP",
  vinted_go: "VG",
  amazon: "AZ",
};

function CarrierLogo({ id, name, color }) {
  return (
    <div
      data-testid={`carrier-logo-${id}`}
      className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-extrabold tracking-tight text-white"
        style={{ background: color }}
      >
        {CODES[id] || name.slice(0, 2).toUpperCase()}
      </span>
      <span className="text-xs font-bold text-[#14161C]">{name}</span>
    </div>
  );
}

export default function PointDetail({ point, carriersInfo = [], isAdmin = false, onEdit, onDeleted, onClose, onRequireAuth }) {
  const { user, favorites, toggleFavorite } = useAuth();
  const isFav = favorites.includes(point.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/admin/points/${point.id}`);
      toast.success("Point relais supprimé");
      onDeleted && onDeleted(point.id);
      onClose();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Échec de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  const infoById = {};
  carriersInfo.forEach((c) => (infoById[c.id] = c));
  const handledIds = point.carriers && point.carriers.length ? point.carriers : [point.carrier];
  const handled = handledIds.map((id) => infoById[id] || {
    id,
    name: point.carrier_name,
    color: point.color,
  });

  const handleFav = async () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    await toggleFavorite(point.id);
    toast.success(isFav ? "Retiré des favoris" : "Ajouté aux favoris");
  };

  const handleRoute = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}&travelmode=driving`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const days = [
    { key: "lun-ven", label: "Lundi – Vendredi" },
    { key: "sam", label: "Samedi" },
    { key: "dim", label: "Dimanche" },
  ];

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center sm:items-center p-0 sm:p-4"
      data-testid="point-detail"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white border border-black/10 shadow-[0_20px_60px_rgba(0,0,0,0.25)] rp-fade-up max-h-[88vh] overflow-y-auto rp-scroll">
        {/* Header band with carrier color */}
        <div className="h-1.5 w-full rounded-t-2xl" style={{ background: point.color }} />

        <div className="p-6">
          <button
            onClick={onClose}
            aria-label="Fermer"
            data-testid="detail-close-btn"
            className="absolute right-4 top-5 rounded-full bg-black/5 p-2 hover:bg-black/10 transition-[background-color]"
          >
            <X className="h-4 w-4" />
          </button>

          {isAdmin && (
            <div className="absolute right-14 top-5 flex items-center gap-1.5">
              <button
                onClick={() => onEdit && onEdit(point)}
                aria-label="Éditer"
                data-testid="detail-edit-btn"
                className="flex items-center gap-1 rounded-full bg-[#14161C] px-2.5 py-2 text-[11px] font-semibold text-white hover:bg-[#2a2d36] transition-[background-color]"
              >
                <Pencil className="h-3.5 w-3.5" /> Éditer
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                aria-label="Supprimer"
                data-testid="detail-delete-btn"
                className="flex items-center gap-1 rounded-full border border-red-500/40 bg-red-50 px-2.5 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-100 transition-[background-color]"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </button>
            </div>
          )}

          {isAdmin && confirmDelete && (
            <div
              className="mb-4 mt-9 rounded-xl border border-red-500/30 bg-red-50 p-3"
              data-testid="detail-delete-confirm"
            >
              <p className="mb-2 text-xs font-medium text-red-700">
                Supprimer définitivement ce point ? Cette action est irréversible.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={doDelete}
                  disabled={deleting}
                  data-testid="detail-delete-confirm-btn"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-[background-color]"
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Oui, supprimer
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-black/5 transition-[background-color]"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Carrier + type */}
          <div className="mb-1 flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: point.color, boxShadow: `0 0 8px ${point.color}` }}
            />
            <span className="text-sm font-semibold" style={{ color: point.color }}>
              {point.carrier_name}
            </span>
            <span
              data-testid="detail-type"
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                point.type === "locker" ? "bg-[#14161C] text-white" : "bg-black/[0.06] text-gray-600"
              }`}
            >
              {point.type === "locker" ? (
                <><Box className="h-2.5 w-2.5" /> Locker</>
              ) : (
                <><Store className="h-2.5 w-2.5" /> Point relais</>
              )}
            </span>
          </div>

          {/* Exact name */}
          <h2 className="font-head text-xl font-semibold tracking-tight text-[#14161C]" data-testid="detail-name">
            {point.name}
          </h2>

          {point.distance != null && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-xs text-gray-600">
              <Navigation2 className="h-3.5 w-3.5" /> à {point.distance} km
            </span>
          )}

          {/* Carriers handled — logos */}
          <div className="mt-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-gray-400">
              {point.type === "locker"
                ? "Transporteur du locker"
                : "Transporteurs pris en charge"}
            </p>
            <div className="flex flex-wrap gap-2" data-testid="detail-carriers">
              {handled.map((c) => (
                <CarrierLogo key={c.id} id={c.id} name={c.name} color={c.color} />
              ))}
            </div>
          </div>

          {/* Address */}
          <div className="mt-4 flex items-start gap-2 text-sm text-[#14161C]">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <span data-testid="detail-address">
              {point.address}, {point.postal_code} {point.city}
            </span>
          </div>

          {/* Coordinates */}
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
            <Locate className="h-4 w-4 shrink-0 text-gray-400" />
            <span data-testid="detail-coords">
              {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
            </span>
          </div>

          {/* Phone */}
          {point.phone && (
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
              <Phone className="h-4 w-4 shrink-0 text-gray-400" />
              <span data-testid="detail-phone">{point.phone}</span>
            </div>
          )}

          {/* Opening hours */}
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-gray-400">
              <Clock className="h-3.5 w-3.5" /> Horaires d'ouverture
            </div>
            <div className="overflow-hidden rounded-xl border border-black/10" data-testid="detail-hours">
              {days.map((d, i) => {
                const val = point.hours[d.key] || "Fermé";
                const closed = val.toLowerCase() === "fermé";
                return (
                  <div
                    key={d.key}
                    className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                      i > 0 ? "border-t border-black/5" : ""
                    }`}
                  >
                    <span className="text-[#14161C]">{d.label}</span>
                    <span className={closed ? "text-gray-400" : "font-medium text-[#14161C]"}>
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex gap-2">
            <button
              onClick={handleRoute}
              data-testid="detail-route-btn"
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#14161C] py-3 text-sm font-semibold text-white hover:bg-[#2a2d36] transition-[background-color]"
            >
              <Navigation2 className="h-4 w-4" /> Itinéraire
            </button>
            <button
              onClick={handleFav}
              aria-label="Favori"
              data-testid="detail-fav-btn"
              className="flex items-center justify-center rounded-full border border-black/10 bg-white px-4 hover:bg-black/5 transition-[background-color]"
            >
              <Heart className={`h-5 w-5 transition-[color,fill] ${isFav ? "fill-red-500 text-red-500" : "text-gray-500"}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
