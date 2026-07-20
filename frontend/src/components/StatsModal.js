import { useEffect, useState } from "react";
import { X, BarChart3, Users, Download, Loader2, Star, MessageSquare } from "lucide-react";
import { api } from "@/lib/api";

export default function StatsModal({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState(null);

  useEffect(() => {
    api
      .get("/admin/stats", { params: { days: 30 } })
      .then(({ data }) => setData(data))
      .catch(() => setData({ days: [], total_visits: 0, total_installs: 0 }))
      .finally(() => setLoading(false));
    api
      .get("/admin/reviews")
      .then(({ data }) => setReviews(data))
      .catch(() => setReviews({ reviews: [], count: 0, average: 0 }));
  }, []);

  const days = data?.days || [];
  const maxVal = Math.max(1, ...days.map((d) => Math.max(d.visits, d.installs)));
  const fmtDate = (s) => {
    const [, m, d] = s.split("-");
    return `${d}/${m}`;
  };

  return (
    <div className="fixed inset-0 z-[2200] flex items-end justify-center p-0 sm:items-center sm:p-4" data-testid="stats-modal">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white border border-black/10 shadow-[0_20px_60px_rgba(0,0,0,0.3)] rp-fade-up max-h-[92vh] overflow-y-auto rp-scroll">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-white/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#14161C]">
              <BarChart3 className="h-3.5 w-3.5 text-[#FFCC00]" />
            </span>
            <h2 className="font-head text-base font-semibold tracking-tight text-[#14161C]">
              Statistiques d'audience
            </h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" data-testid="stats-close" className="rounded-full bg-black/5 p-2 hover:bg-black/10 transition-[background-color]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-5 p-6">
            {/* Totaux */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-black/10 bg-[#F4F4F5] p-4" data-testid="stat-visits">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  <Users className="h-3.5 w-3.5" /> Visiteurs
                </div>
                <div className="font-head text-2xl font-bold text-[#14161C]">{data.total_visits}</div>
                <div className="text-[11px] text-gray-400">Aujourd'hui : {data.today_visits}</div>
              </div>
              <div className="rounded-xl border border-black/10 bg-[#F4F4F5] p-4" data-testid="stat-installs">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  <Download className="h-3.5 w-3.5" /> Installations
                </div>
                <div className="font-head text-2xl font-bold text-[#14161C]">{data.total_installs}</div>
                <div className="text-[11px] text-gray-400">Aujourd'hui : {data.today_installs}</div>
              </div>
            </div>

            {/* Légende */}
            <div className="flex items-center gap-4 text-[11px] text-gray-500">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#3399FF]" /> Visiteurs</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#FFCC00]" /> Installations</span>
              <span className="ml-auto">30 derniers jours</span>
            </div>

            {/* Graphe par jour */}
            <div className="space-y-1.5" data-testid="stats-daily">
              {days.map((d) => (
                <div key={d.date} className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[10px] tabular-nums text-gray-400">{fmtDate(d.date)}</span>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <div className="h-2 rounded-full bg-black/[0.04]">
                      <div className="h-2 rounded-full bg-[#3399FF]" style={{ width: `${(d.visits / maxVal) * 100}%` }} />
                    </div>
                    <div className="h-2 rounded-full bg-black/[0.04]">
                      <div className="h-2 rounded-full bg-[#FFCC00]" style={{ width: `${(d.installs / maxVal) * 100}%` }} />
                    </div>
                  </div>
                  <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-gray-500">
                    {d.visits} / {d.installs}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-gray-400">
              « Visiteurs » = visites de l'application (une par session/jour). « Installations » = ajouts de l'app à l'écran d'accueil (PWA).
            </p>

            {/* Avis clients */}
            <div className="border-t border-black/10 pt-5" data-testid="admin-reviews">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-[#14161C]">
                  <MessageSquare className="h-4 w-4" /> Avis clients
                </div>
                {reviews && reviews.count > 0 && (
                  <div className="flex items-center gap-1 text-[11px] font-medium text-gray-500">
                    <Star className="h-3.5 w-3.5 fill-[#FFCC00] text-[#FFCC00]" />
                    {reviews.average} / 5 · {reviews.count} avis
                  </div>
                )}
              </div>
              {!reviews ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
              ) : reviews.count === 0 ? (
                <p className="text-[13px] text-gray-400">Aucun avis pour le moment.</p>
              ) : (
                <div className="space-y-2.5">
                  {reviews.reviews.map((r) => (
                    <div key={r.id} className="rounded-xl border border-black/10 bg-[#F4F4F5] p-3" data-testid="review-item">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-[#14161C]">{r.user_name || "Utilisateur"}</span>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} className={`h-3.5 w-3.5 ${n <= r.rating ? "fill-[#FFCC00] text-[#FFCC00]" : "text-gray-300"}`} />
                          ))}
                        </div>
                      </div>
                      <div className="mb-1 text-[11px] text-gray-400">{r.user_email} · {r.created_at?.slice(0, 10)}</div>
                      {r.comment && <p className="text-[13px] leading-relaxed text-gray-700">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
