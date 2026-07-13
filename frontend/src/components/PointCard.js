import { Heart, MapPin, Clock, Phone, Navigation2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function PointCard({ point, active, onSelect, onRequireAuth, index }) {
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

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`point-card-${point.id}`}
      onClick={() => onSelect(point)}
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
      className={`rp-fade-up group cursor-pointer rounded-xl border p-4 transition-[transform,border-color,background-color] hover:-translate-y-0.5 ${
        active
          ? "border-white/40 bg-white/[0.06]"
          : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ background: point.color, boxShadow: `0 0 8px ${point.color}` }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-head text-sm font-semibold">{point.name}</p>
              <p
                className="text-xs font-medium"
                style={{ color: point.color }}
                data-testid={`point-carrier-${point.id}`}
              >
                {point.carrier_name}
              </p>
            </div>
            <button
              onClick={handleFav}
              aria-label="Favori"
              data-testid={`fav-btn-${point.id}`}
              className="rounded-full bg-white/5 p-2 hover:bg-white/10 transition-[background-color]"
            >
              <Heart
                className={`h-4 w-4 transition-[color,fill] ${
                  isFav ? "fill-red-500 text-red-500" : "text-white/60"
                }`}
              />
            </button>
          </div>

          <div className="mt-2 space-y-1 text-xs text-white/60">
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

          {point.distance != null && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-[11px] text-white/70">
              <Navigation2 className="h-3 w-3" />
              {point.distance} km
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
