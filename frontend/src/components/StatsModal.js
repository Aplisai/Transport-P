import { useEffect, useState } from "react";
import { X, BarChart3, Users, Download, Loader2, UserCheck, UserX } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { api } from "@/lib/api";

export default function StatsModal({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(7);
  const [expanded, setExpanded] = useState(null);
  const [users, setUsers] = useState(null);

  const toggleCard = (key) => {
    setExpanded((prev) => (prev === key ? null : key));
    if (key === "registered" && !users) {
      api
        .get("/admin/users")
        .then(({ data }) => setUsers(data))
        .catch(() => setUsers({ users: [], count: 0 }));
    }
  };

  useEffect(() => {
    api
      .get("/admin/stats", { params: { days: period } })
      .then(({ data }) => setData(data))
      .catch(() => setData({ days: [], total_visits: 0, total_installs: 0 }))
      .finally(() => setLoading(false));
  }, [period]);

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
            {/* Cartes cliquables */}
            <div className="grid grid-cols-2 gap-3" data-testid="stat-cards">
              <button
                onClick={() => toggleCard("visits")}
                data-testid="stat-visits"
                className={`rounded-xl border bg-[#F4F4F5] p-4 text-left transition-[border-color,background-color] hover:bg-black/[0.04] ${expanded === "visits" ? "border-[#14161C] ring-1 ring-[#14161C]" : "border-black/10"}`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  <Users className="h-3.5 w-3.5" /> Visiteurs
                </div>
                <div className="font-head text-2xl font-bold text-[#14161C]">{data.total_visits}</div>
                <div className="text-[11px] text-gray-400">Aujourd'hui : {data.today_visits}</div>
              </button>
              <button
                onClick={() => toggleCard("installs")}
                data-testid="stat-installs"
                className={`rounded-xl border bg-[#F4F4F5] p-4 text-left transition-[border-color,background-color] hover:bg-black/[0.04] ${expanded === "installs" ? "border-[#14161C] ring-1 ring-[#14161C]" : "border-black/10"}`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  <Download className="h-3.5 w-3.5" /> Installations
                </div>
                <div className="font-head text-2xl font-bold text-[#14161C]">{data.total_installs}</div>
                <div className="text-[11px] text-gray-400">Aujourd'hui : {data.today_installs}</div>
              </button>
              <button
                onClick={() => toggleCard("registered")}
                data-testid="stat-registered"
                className={`rounded-xl border bg-[#F4F4F5] p-4 text-left transition-[border-color,background-color] hover:bg-black/[0.04] ${expanded === "registered" ? "border-[#14161C] ring-1 ring-[#14161C]" : "border-black/10"}`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  <UserCheck className="h-3.5 w-3.5" /> Comptes créés
                </div>
                <div className="font-head text-2xl font-bold text-[#14161C]">{data.registered_users ?? 0}</div>
                <div className="text-[11px] text-gray-400">Utilisateurs avec un compte</div>
              </button>
              <button
                onClick={() => toggleCard("anon")}
                data-testid="stat-anon"
                className={`rounded-xl border bg-[#F4F4F5] p-4 text-left transition-[border-color,background-color] hover:bg-black/[0.04] ${expanded === "anon" ? "border-[#14161C] ring-1 ring-[#14161C]" : "border-black/10"}`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  <UserX className="h-3.5 w-3.5" /> Visiteurs sans compte
                </div>
                <div className="font-head text-2xl font-bold text-[#14161C]">{data.visits_anon ?? 0}</div>
                <div className="text-[11px] text-gray-400">Visites non connectées</div>
              </button>
            </div>

            {/* Panneau de détail */}
            {expanded && (
              <div className="rounded-xl border border-black/10 bg-white p-4" data-testid="stat-detail">
                {expanded === "visits" && (
                  <div className="space-y-2 text-sm text-gray-700">
                    <p className="font-semibold text-[#14161C]">Détail des visiteurs</p>
                    <div className="flex justify-between"><span>Total des visites</span><span className="font-semibold tabular-nums">{data.total_visits}</span></div>
                    <div className="flex justify-between"><span>Aujourd'hui</span><span className="font-semibold tabular-nums">{data.today_visits}</span></div>
                    <div className="flex justify-between"><span>Dont visiteurs connectés</span><span className="font-semibold tabular-nums">{data.visits_auth ?? 0}</span></div>
                    <div className="flex justify-between"><span>Dont visiteurs sans compte</span><span className="font-semibold tabular-nums">{data.visits_anon ?? 0}</span></div>
                    <p className="pt-1 text-[11px] text-gray-400">Une visite est comptée une fois par session et par jour.</p>
                  </div>
                )}
                {expanded === "installs" && (
                  <div className="space-y-2 text-sm text-gray-700">
                    <p className="font-semibold text-[#14161C]">Détail des installations</p>
                    <div className="flex justify-between"><span>Total des installations</span><span className="font-semibold tabular-nums">{data.total_installs}</span></div>
                    <div className="flex justify-between"><span>Aujourd'hui</span><span className="font-semibold tabular-nums">{data.today_installs}</span></div>
                    <p className="pt-1 text-[11px] text-gray-400">Comptabilise chaque ajout de l'application à l'écran d'accueil (PWA) sur mobile ou ordinateur.</p>
                  </div>
                )}
                {expanded === "anon" && (
                  <div className="space-y-2 text-sm text-gray-700">
                    <p className="font-semibold text-[#14161C]">Détail des visiteurs sans compte</p>
                    <div className="flex justify-between"><span>Visites sans compte (total)</span><span className="font-semibold tabular-nums">{data.visits_anon ?? 0}</span></div>
                    <div className="flex justify-between"><span>Aujourd'hui</span><span className="font-semibold tabular-nums">{data.today_visits_anon ?? 0}</span></div>
                    <div className="flex justify-between"><span>Visiteurs connectés (total)</span><span className="font-semibold tabular-nums">{data.visits_auth ?? 0}</span></div>
                    <p className="pt-1 text-[11px] text-gray-400">Visites d'utilisateurs non connectés (sans compte). Suivi depuis l'activation de cette mesure.</p>
                  </div>
                )}
                {expanded === "registered" && (
                  <div className="space-y-2 text-sm text-gray-700">
                    <p className="font-semibold text-[#14161C]">Comptes créés {users ? `(${users.count})` : ""}</p>
                    {!users ? (
                      <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                    ) : users.count === 0 ? (
                      <p className="text-[13px] text-gray-400">Aucun compte pour le moment.</p>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-y-auto rp-scroll" data-testid="users-list">
                        {users.users.map((u) => (
                          <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg border border-black/10 bg-[#F4F4F5] px-3 py-2" data-testid="user-item">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-[13px] font-semibold text-[#14161C]">{u.name || "Sans nom"}</span>
                                {u.role === "admin" && (
                                  <span className="shrink-0 rounded-full bg-[#FFCC00] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#14161C]">Admin</span>
                                )}
                              </div>
                              <div className="truncate text-[11px] text-gray-500">{u.email}</div>
                            </div>
                            <div className="shrink-0 text-right text-[10px] text-gray-400">
                              <div>{u.created_at ? u.created_at.slice(0, 10) : "—"}</div>
                              <div>{u.favorites_count} favori{u.favorites_count > 1 ? "s" : ""}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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
          </div>
        )}
      </div>
    </div>
  );
}
