import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, X, Package, Megaphone, Send, Loader2, Star, ArrowLeft, ExternalLink, MessageSquare, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

export const NotificationBell = ({ onOpenPoint }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("info");
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [selectedNotif, setSelectedNotif] = useState(null);
  const ref = useRef(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [reviews, setReviews] = useState(null);
  const [notice, setNotice] = useState("");
  const [noticeInput, setNoticeInput] = useState("");
  const [savingNotice, setSavingNotice] = useState(false);

  const fetchNotice = useCallback(() => {
    api
      .get("/notice")
      .then(({ data }) => {
        setNotice(data.text || "");
        setNoticeInput(data.text || "");
      })
      .catch(() => {});
  }, []);

  const saveNotice = async () => {
    setSavingNotice(true);
    try {
      const { data } = await api.post("/admin/notice", { text: noticeInput });
      setNotice(data.text || "");
      toast.success("Message permanent mis à jour");
    } catch {
      toast.error("Échec de la mise à jour");
    } finally {
      setSavingNotice(false);
    }
  };

  const clearNotice = async () => {
    setSavingNotice(true);
    try {
      await api.post("/admin/notice", { text: "" });
      setNotice("");
      setNoticeInput("");
      toast.success("Message effacé");
    } catch {
      toast.error("Échec de la suppression");
    } finally {
      setSavingNotice(false);
    }
  };

  const fetchNotifs = useCallback(() => {
    api
      .get("/notifications")
      .then(({ data }) => {
        setItems(data.notifications || []);
        setUnread(data.unread || 0);
        setNotifEnabled(data.enabled !== false);
      })
      .catch(() => {});
  }, []);

  const fetchReviews = useCallback(() => {
    api
      .get("/admin/reviews")
      .then(({ data }) => setReviews(data))
      .catch(() => setReviews({ reviews: [], count: 0, average: 0 }));
  }, []);

  const toggleNotifEnabled = () => {
    const next = !notifEnabled;
    setNotifEnabled(next);
    if (!next) setUnread(0);
    api.post("/notifications/toggle", { enabled: next }).then(fetchNotifs).catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifs();
    fetchNotice();
    const t = setInterval(fetchNotifs, 60000);
    return () => clearInterval(t);
  }, [user, fetchNotifs, fetchNotice]);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && tab === "info" && unread > 0) {
      api.post("/notifications/read").then(() => setUnread(0)).catch(() => {});
    }
  };

  const switchTab = (t) => {
    setTab(t);
    if (t === "info" && unread > 0) {
      api.post("/notifications/read").then(() => setUnread(0)).catch(() => {});
    }
    if (t === "reviews" && isAdmin) fetchReviews();
  };

  const publish = async () => {
    if (!title.trim()) return toast.error("Le titre est obligatoire");
    setPublishing(true);
    try {
      await api.post("/admin/notifications", { title, body, link });
      toast.success("Annonce publiée");
      setTitle("");
      setBody("");
      setLink("");
      fetchNotifs();
    } catch {
      toast.error("Échec de la publication");
    } finally {
      setPublishing(false);
    }
  };

  if (!user) return null;

  const inputCls = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/30 transition-[border-color]";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        data-testid="notification-bell-btn"
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#FFCC00] text-[#14161C] hover:bg-[#f5c400] transition-[background-color]"
      >
        <Bell className="h-4 w-4" />
        {notifEnabled && unread > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notification-panel"
          className="absolute left-0 top-11 z-[1200] w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        >
          {/* Onglets */}
          <div className="flex items-stretch gap-1 border-b border-black/10 p-2">
            <button
              onClick={() => switchTab("info")}
              data-testid="notif-tab-info"
              className={`relative flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold leading-tight transition-[background-color,color] ${tab === "info" ? "bg-[#FFCC00] text-[#14161C]" : "bg-[#FFCC00]/70 text-[#14161C] hover:bg-[#FFCC00]"}`}
            >
              <Bell className="h-3.5 w-3.5 shrink-0" />
              Information Client
              {notifEnabled && unread > 0 && tab !== "info" && (
                <span className="ml-0.5 rounded-full bg-red-500 px-1.5 text-[9px] text-white">{unread}</span>
              )}
            </button>
            {isAdmin && (
              <button
                onClick={() => switchTab("reviews")}
                data-testid="notif-tab-reviews"
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold leading-tight transition-[background-color,color] ${tab === "reviews" ? "bg-[#FFCC00] text-[#14161C]" : "bg-[#FFCC00]/70 text-[#14161C] hover:bg-[#FFCC00]"}`}
              >
                <Star className="h-3.5 w-3.5 shrink-0" />
                Avis clients
              </button>
            )}
            <button onClick={() => setOpen(false)} aria-label="Fermer" className="flex items-center rounded-lg px-1 text-gray-400 hover:text-[#14161C]">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Onglet Avis clients (admin) */}
          {tab === "reviews" && isAdmin && (
            <div className="max-h-96 overflow-y-auto rp-scroll p-3" data-testid="reviews-admin-list">
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <Star className="h-3.5 w-3.5" /> Avis clients {reviews ? `(${reviews.count})` : ""}
                </p>
                {reviews && reviews.count > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-gray-500">
                    <Star className="h-3.5 w-3.5 fill-[#FFCC00] text-[#FFCC00]" />
                    {reviews.average} / 5
                  </span>
                )}
              </div>
              {!reviews ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
              ) : reviews.count === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">Aucun avis pour le moment.</p>
              ) : (
                <div className="space-y-2">
                  {reviews.reviews.map((r) => (
                    <div key={r.id} className="rounded-xl border border-black/10 bg-[#F4F4F5] p-3" data-testid="review-item">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold text-[#14161C]">{r.user_name || "Utilisateur"}</span>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} className={`h-3.5 w-3.5 ${n <= r.rating ? "fill-[#FFCC00] text-[#FFCC00]" : "text-gray-300"}`} />
                          ))}
                        </div>
                      </div>
                      <div className="mb-1 text-[10px] text-gray-400">{r.user_email} · {r.created_at?.slice(0, 10)}</div>
                      {r.comment && <p className="text-[12px] leading-relaxed text-gray-700">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Onglet Information Client */}
          {tab === "info" && selectedNotif && (
            <div className="p-4" data-testid="notification-detail">
              <button
                onClick={() => setSelectedNotif(null)}
                data-testid="notification-detail-back"
                className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 hover:text-[#14161C] transition-[color]"
              >
                <ArrowLeft className="h-4 w-4" /> Retour
              </button>
              <div className="flex items-center gap-2">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${selectedNotif.type === "point" ? "bg-[#FFCC00]/20 text-[#8a7400]" : "bg-[#3399FF]/15 text-[#3399FF]"}`}>
                  {selectedNotif.type === "point" ? <Package className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
                </span>
                <div>
                  <h3 className="font-head text-base font-semibold leading-tight text-[#14161C]">{selectedNotif.title}</h3>
                  <p className="text-[11px] text-gray-400">{timeAgo(selectedNotif.created_at)}</p>
                </div>
              </div>
              {selectedNotif.body ? (
                <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-700">{selectedNotif.body}</p>
              ) : (
                <p className="mt-4 text-[13px] italic text-gray-400">Aucun détail supplémentaire.</p>
              )}
              {selectedNotif.link && (
                <a
                  href={selectedNotif.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="notification-detail-link"
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-[#3399FF] py-2 text-xs font-semibold text-white hover:bg-[#2b86e6] transition-[background-color]"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Ouvrir l'offre
                </a>
              )}
            </div>
          )}

          {tab === "info" && !selectedNotif && (
            <div>
              {notice && (
                <div className="mx-4 my-3 rounded-lg bg-[#17BEBB] px-4 py-3 shadow-sm" data-testid="permanent-notice">
                  <p className="whitespace-pre-wrap text-[12px] font-medium leading-relaxed text-white">{notice}</p>
                </div>
              )}
              <div className="flex items-center justify-between border-b border-black/10 px-4 py-3" data-testid="notif-toggle-row">
                <div>
                  <p className="text-[13px] font-semibold text-[#14161C]">Recevoir les notifications</p>
                  <p className="text-[11px] text-gray-400">Annonces et nouveaux points</p>
                </div>
                <button
                  onClick={toggleNotifEnabled}
                  data-testid="notif-toggle-btn"
                  role="switch"
                  aria-checked={notifEnabled}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-[background-color] ${notifEnabled ? "bg-red-500" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${notifEnabled ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>

              {isAdmin && (
                <div className="border-b border-black/10 bg-[#F4F4F5] p-3" data-testid="announcement-form">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    <Megaphone className="h-3.5 w-3.5" /> Publier une annonce
                  </p>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Titre de l'annonce" data-testid="announcement-title-input" className={`${inputCls} mb-2`} />
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={1000} placeholder="Message (facultatif)" data-testid="announcement-body-input" className={`${inputCls} mb-2 resize-none`} />
                  <input value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} placeholder="Lien de l'offre (facultatif) — ex : https://..." data-testid="announcement-link-input" className={`${inputCls} mb-1`} />
                  <p className="mb-2 flex items-center gap-1 text-[10px] text-gray-400"><ExternalLink className="h-3 w-3" /> Avec un lien, l'annonce s'ouvre dans un nouvel onglet.</p>
                  <button onClick={publish} disabled={publishing} data-testid="announcement-publish-btn" className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#14161C] py-2 text-xs font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]">
                    {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Publier
                  </button>
                </div>
              )}
              {isAdmin && (
                <div className="border-b border-black/10 bg-[#F4F4F5] p-3" data-testid="notice-editor">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    <MessageSquare className="h-3.5 w-3.5" /> Message permanent (visiteurs)
                  </p>
                  <textarea
                    value={noticeInput}
                    onChange={(e) => setNoticeInput(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Texte affiché en permanence aux visiteurs (en rouge)"
                    data-testid="notice-input"
                    className={`${inputCls} mb-2 resize-none`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveNotice}
                      disabled={savingNotice}
                      data-testid="notice-save-btn"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#14161C] py-2 text-xs font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]"
                    >
                      {savingNotice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Enregistrer
                    </button>
                    <button
                      onClick={clearNotice}
                      disabled={savingNotice || !notice}
                      data-testid="notice-clear-btn"
                      className="flex items-center justify-center gap-1.5 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-black/5 disabled:opacity-50 transition-[background-color]"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Effacer
                    </button>
                  </div>
                </div>
              )}
              <div className="max-h-80 overflow-y-auto rp-scroll">
                {!notifEnabled ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400" data-testid="notif-disabled-msg">
                    Notifications désactivées. Activez-les ci-dessus pour recevoir les annonces, les nouveaux points et les nouvelles fonctionnalités.
                  </p>
                ) : items.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400" data-testid="notification-empty">
                    Aucune information pour le moment.
                  </p>
                ) : (
                  items.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (n.type === "point" && n.ref_id && onOpenPoint) {
                          setOpen(false);
                          onOpenPoint(n.ref_id);
                        } else if (n.link) {
                          window.open(n.link, "_blank", "noopener,noreferrer");
                        } else {
                          setSelectedNotif(n);
                        }
                      }}
                      data-testid="notification-item"
                      className="flex w-full gap-3 border-b border-black/5 px-4 py-3 text-left last:border-0 hover:bg-black/[0.03] transition-[background-color]"
                    >
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${n.type === "point" ? "bg-[#FFCC00]/20 text-[#8a7400]" : "bg-[#3399FF]/15 text-[#3399FF]"}`}>
                        {n.type === "point" ? <Package className="h-3.5 w-3.5" /> : <Megaphone className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-[#14161C]">{n.title}</p>
                        {n.body && <p className="truncate text-[12px] leading-relaxed text-gray-600">{n.body}</p>}
                        {n.type === "point" && n.ref_id ? (
                          <p className="mt-0.5 flex items-center gap-0.5 text-[10px] font-semibold text-[#8a7400]">
                            <Package className="h-3 w-3" /> Ouvrir le point
                          </p>
                        ) : n.link ? (
                          <p className="mt-0.5 flex items-center gap-0.5 text-[10px] font-semibold text-[#3399FF]">
                            <ExternalLink className="h-3 w-3" /> Ouvrir l'offre
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[10px] text-[#3399FF]">Voir le détail →</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
