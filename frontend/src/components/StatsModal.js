import { useEffect, useState } from "react";
import { X, BarChart3, Users, Download, Loader2, Star, MessageSquare, UserCheck, UserX } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { api } from "@/lib/api";

export default function StatsModal({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState(null);
  const [period, setPeriod] = useState(7);

  useEffect(() => {
    api
      .get("/admin/stats", { params: { days: period } })
      .then(({ data }) => setData(data))
      .catch(() => setData({ days: [], total_visits: 0, total_installs: 0 }))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    api
      .get("/admin/reviews")
      .then(({ data }) => setReviews(data))
      .catch(() => setReviews({ reviews: [], count: 0, average: 0 }));
  }, []);

  const fmtDate = (s) => {
    const [, m, d] = s.split("-");
    return `${d}/${m}`;
  };
  // Du plus ancien au plus récent (lecture de gauche à droite)
  const chartData = [...(data?.days || [])]
    .reverse()
    .map((d) => ({ jour: fmtDate(d.date), Visiteurs: d.visits, Installations: d.installs }));
  const maxV = Math.max(1, ...chartData.map((d) => Math.max(d.Visiteurs, d.Installations)));
  const yTop = Math.max(4, Math.ceil(maxV / 2) * 2);
  const yTicks = [0, yTop / 2, yTop];

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

            {/* Utilisateurs : avec / sans compte */}
            <div className="grid grid-cols-2 gap-3" data-testid="stat-users">
              <div className="rounded-xl border border-black/10 bg-[#F4F4F5] p-4" data-testid="stat-registered">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  <UserCheck className="h-3.5 w-3.5" /> Comptes créés
                </div>
                <div className="font-head text-2xl font-bold text-[#14161C]">{data.registered_users ?? 0}</div>
                <div className="text-[11px] text-gray-400">Utilisateurs avec un compte</div>
              </div>
              <div className="rounded-xl border border-black/10 bg-[#F4F4F5] p-4" data-testid="stat-anon">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  <UserX className="h-3.5 w-3.5" /> Visiteurs sans compte
                </div>
                <div className="font-head text-2xl font-bold text-[#14161C]">{data.visits_anon ?? 0}</div>
                <div className="text-[11px] text-gray-400">Visites non connectées</div>
              </div>
            </div>

            {/* Sélecteur de période + graphique */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#14161C]">Évolution</h3>
                <div className="flex gap-1 rounded-full bg-black/5 p-1" data-testid="stats-period">
                  {[7, 30].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      data-testid={`stats-period-${p}`}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-[background-color,color] ${
                        period === p ? "bg-[#14161C] text-white" : "text-gray-500 hover:text-[#14161C]"
                      }`}
                    >
                      {p} jours
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-black/10 bg-white p-3" data-testid="stats-chart">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke="#eee" />
                    <XAxis
                      dataKey="jour"
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      interval={period === 7 ? 0 : "preserveStartEnd"}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      domain={[0, yTop]}
                      ticks={yTicks}
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      contentStyle={{ borderRadius: 12, border: "1px solid #eee", fontSize: 12 }}
                      labelFormatter={(l) => `Le ${l}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
                    <Bar dataKey="Visiteurs" fill="#3399FF" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="Installations" fill="#FFCC00" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-gray-400">
              « Visiteurs » = nombre de visites de l'application (une par session et par jour). « Installations » = nombre de fois où l'app a été ajoutée à l'écran d'accueil (PWA). Survolez une barre pour voir le détail d'une journée.
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
