import { memo } from "react";
import { Heart, MapPin, Clock, Phone, Navigation2, Box, Store } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

function PointCard({ point, active, onSelect, onRequireAuth, index }) {
  const { user, favorites, toggleFavorite } = useAuth();
  const isFav = favorites.includes(point.id);

  const handleFav = async (e) => {
    e.stopPropagation();
    if (!user) {
      onRequireAuth();
      return;
    }
    await toggleFavorite(point.id);
    toast.success(isFav ? "Retiré des favoris" : "Ajouté aux favoris");
  };

  const handleRoute = (e) => {
    e.stopPropagation();
    const dest = `${point.lat},${point.lng}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`point-card-${point.id}`}
      onClick={() => onSelect(point)}
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
      className={`rp-fade-up group cursor-pointer rounded-xl border p-4 transition-[transform,border-color,background-color,box-shadow] hover:-translate-y-0.5 ${
        active
          ? "border-[#14161C]/40 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
          : "border-black/10 bg-white hover:border-black/25 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
      }`}
    >
      <div className="flex items-start gap-3">
        {point.photo && (
          <img
            src={`${process.env.REACT_APP_BACKEND_URL}${point.photo}`}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />
        )}
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ background: point.color, boxShadow: `0 0 8px ${point.color}` }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-head text-sm font-semibold text-[#14161C]">
                {point.name}
              </p>
              <div className="flex items-center gap-1.5">
                <p
                  className="text-xs font-semibold"
                  style={{ color: point.color }}
                  data-testid={`point-carrier-${point.id}`}
                >
                  {point.carrier_name}
                </p>
                <span
                  data-testid={`point-type-${point.id}`}
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    point.type === "locker"
                      ? "bg-[#14161C] text-white"
                      : "bg-black/[0.06] text-gray-600"
                  }`}
                >
                  {point.type === "locker" ? (
                    <>
                      <Box className="h-2.5 w-2.5" /> Locker
                    </>
                  ) : (
                    <>
                      <Store className="h-2.5 w-2.5" /> Relais
                    </>
                  )}
                </span>
              </div>
            </div>
            <button
              onClick={handleFav}
              aria-label="Favori"
              data-testid={`fav-btn-${point.id}`}
              className="rounded-full bg-black/5 p-2 hover:bg-black/10 transition-[background-color]"
            >
              <Heart
                className={`h-4 w-4 transition-[color,fill] ${
                  isFav ? "fill-red-500 text-red-500" : "text-gray-500"
                }`}
              />
            </button>
          </div>

          <div className="mt-2 space-y-1 text-xs text-gray-500">
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {point.address}, {point.postal_code} {point.city}
            </p>
            <p className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Lun-Ven {point.hours["lun-ven"]}
            </p>
            {point.phone && (
              <p className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {point.phone}
              </p>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2">
            {point.distance != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-1 text-[11px] text-gray-600">
                <Navigation2 className="h-3 w-3" />
                {point.distance} km
              </span>
            )}
            <button
              onClick={handleRoute}
              data-testid={`route-btn-${point.id}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#14161C] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#2a2d36] transition-[background-color]"
            >
              <Navigation2 className="h-3 w-3" />
              Itinéraire
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(PointCard);
