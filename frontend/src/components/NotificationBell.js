import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, X, Package, Megaphone, Send, Loader2, MapPin, Inbox, Trash2, Search } from "lucide-react";
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

export const NotificationBell = ({ carriersInfo = [] }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("proposal");
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  // Annonce admin (onglet Information Client)
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publishing, setPublishing] = useState(false);

  // Proposition (onglet Proposition)
  const [pName, setPName] = useState("");
  const [pAddress, setPAddress] = useState("");
  const [pType, setPType] = useState("relais");
  const [pCarriers, setPCarriers] = useState([]);
  const [pComment, setPComment] = useState("");
  const [sending, setSending] = useState(false);
  const [proposals, setProposals] = useState(null);
  const [addrSuggest, setAddrSuggest] = useState([]);
  const [showAddrSuggest, setShowAddrSuggest] = useState(false);
  const addrTimer = useRef(null);

  const onAddressChange = (v) => {
    setPAddress(v);
    if (addrTimer.current) clearTimeout(addrTimer.current);
    if (v.trim().length >= 3) {
      addrTimer.current = setTimeout(async () => {
        try {
          const { data } = await api.get("/address-suggest", { params: { q: v.trim() } });
          setAddrSuggest(data || []);
          setShowAddrSuggest(true);
        } catch {
          setAddrSuggest([]);
        }
      }, 200);
    } else {
      setAddrSuggest([]);
      setShowAddrSuggest(false);
    }
  };

  const pickAddress = (s) => {
    setPAddress(s.label);
    setShowAddrSuggest(false);
  };

  const toggleCarrier = (id) =>
    setPCarriers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const fetchNotifs = useCallback(() => {
    api
      .get("/notifications")
      .then(({ data }) => {
        setItems(data.notifications || []);
        setUnread(data.unread || 0);
      })
      .catch(() => {});
  }, []);

  const fetchProposals = useCallback(() => {
    api
      .get("/admin/proposals")
      .then(({ data }) => setProposals(data))
      .catch(() => setProposals({ proposals: [], count: 0 }));
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchNotifs();
    const t = setInterval(fetchNotifs, 60000);
    return () => clearInterval(t);
  }, [user, fetchNotifs]);

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
    if (next && isAdmin) fetchProposals();
  };

  const switchTab = (t) => {
    setTab(t);
    if (t === "info" && unread > 0) {
      api.post("/notifications/read").then(() => setUnread(0)).catch(() => {});
    }
    if (t === "proposal" && isAdmin) fetchProposals();
  };

  const publish = async () => {
    if (!title.trim()) return toast.error("Le titre est obligatoire");
    setPublishing(true);
    try {
      await api.post("/admin/notifications", { title, body });
      toast.success("Annonce publiée");
      setTitle("");
      setBody("");
      fetchNotifs();
    } catch {
      toast.error("Échec de la publication");
    } finally {
      setPublishing(false);
    }
  };

  const sendProposal = async () => {
    if (!pName.trim()) return toast.error("Le nom du point est obligatoire");
    setSending(true);
    try {
      await api.post("/proposals", { name: pName, address: pAddress, type: pType, carriers: pCarriers, comment: pComment });
      toast.success("Merci ! Votre proposition a bien été envoyée.");
      setPName("");
      setPAddress("");
      setPType("relais");
      setPCarriers([]);
      setPComment("");
    } catch {
      toast.error("Échec de l'envoi");
    } finally {
      setSending(false);
    }
  };

  const removeProposal = async (id) => {
    try {
      await api.delete(`/admin/proposals/${id}`);
      setProposals((p) => ({ ...p, proposals: p.proposals.filter((x) => x.id !== id), count: p.count - 1 }));
    } catch {
      toast.error("Échec de la suppression");
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
        {unread > 0 && (
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
          className="absolute left-0 top-11 z-[1200] w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        >
          {/* Onglets */}
          <div className="flex items-stretch gap-1 border-b border-black/10 p-2">
            <button
              onClick={() => switchTab("info")}
              data-testid="notif-tab-info"
              className={`relative flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold leading-tight transition-[background-color,color] ${tab === "info" ? "bg-[#14161C] text-white" : "text-gray-500 hover:text-[#14161C]"}`}
            >
              <Bell className="h-3.5 w-3.5 shrink-0" />
              Information Client
              {unread > 0 && tab !== "info" && (
                <span className="ml-0.5 rounded-full bg-red-500 px-1.5 text-[9px] text-white">{unread}</span>
              )}
            </button>
            <button
              onClick={() => switchTab("proposal")}
              data-testid="notif-tab-proposal"
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold leading-tight transition-[background-color,color] ${tab === "proposal" ? "bg-[#14161C] text-white" : "text-gray-500 hover:text-[#14161C]"}`}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              Proposition de point relais ou locker
              {isAdmin && proposals?.count > 0 && (
                <span className="ml-0.5 rounded-full bg-red-500 px-1.5 text-[9px] text-white">{proposals.count}</span>
              )}
            </button>
            <button onClick={() => setOpen(false)} aria-label="Fermer" className="flex items-center rounded-lg px-1 text-gray-400 hover:text-[#14161C]">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Onglet Proposition */}
          {tab === "proposal" && (
            <div>
              {isAdmin ? (
                <div className="max-h-96 overflow-y-auto rp-scroll p-3" data-testid="proposals-admin-list">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    <Inbox className="h-3.5 w-3.5" /> Propositions reçues {proposals ? `(${proposals.count})` : ""}
                  </p>
                  {!proposals ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : proposals.count === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-400">Aucune proposition pour le moment.</p>
                  ) : (
                    <div className="space-y-2">
                      {proposals.proposals.map((p) => (
                        <div key={p.id} className="rounded-xl border border-black/10 bg-[#F4F4F5] p-3" data-testid="proposal-item">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-[13px] font-semibold text-[#14161C]">{p.name}</span>
                                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${p.type === "locker" ? "bg-[#3399FF]/15 text-[#3399FF]" : "bg-[#FFCC00]/25 text-[#8a7400]"}`}>
                                  {p.type === "locker" ? "Locker" : "Relais"}
                                </span>
                              </div>
                              {p.address && <p className="text-[12px] text-gray-600">{p.address}</p>}
                              {p.carriers?.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1" data-testid="proposal-item-carriers">
                                  {p.carriers.map((cid) => {
                                    const c = carriersInfo.find((x) => x.id === cid);
                                    return (
                                      <span key={cid} className="flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-700 ring-1 ring-black/10">
                                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: c?.color || "#999" }} />
                                        {c?.name || cid}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              {p.comment && <p className="mt-0.5 text-[12px] italic text-gray-500">« {p.comment} »</p>}
                              <p className="mt-1 text-[10px] text-gray-400">{p.user_name} · {p.user_email} · {timeAgo(p.created_at)}</p>
                            </div>
                            <button
                              onClick={() => removeProposal(p.id)}
                              data-testid="proposal-delete-btn"
                              aria-label="Supprimer"
                              className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-[background-color,color]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5 p-4" data-testid="proposal-form">
                  <p className="text-[12px] leading-relaxed text-gray-500">
                    Ici, proposez votre point relais ou locker. Une fois vérifié et validé, il fera partie des points relais et lockers disponibles dans un délai de vingt-quatre heures maximum.
                  </p>
                  <input value={pName} onChange={(e) => setPName(e.target.value)} maxLength={120} placeholder="Nom du point *" data-testid="proposal-name-input" className={inputCls} />
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={pAddress}
                      onChange={(e) => onAddressChange(e.target.value)}
                      onFocus={() => addrSuggest.length && setShowAddrSuggest(true)}
                      onBlur={() => setTimeout(() => setShowAddrSuggest(false), 150)}
                      autoComplete="off"
                      maxLength={250}
                      placeholder="Numéro, nom de la rue, ville ou code postal"
                      data-testid="proposal-address-input"
                      className={`${inputCls} pl-9`}
                    />
                    {showAddrSuggest && addrSuggest.length > 0 && (
                      <div
                        data-testid="proposal-address-suggestions"
                        className="absolute left-0 right-0 top-full z-[1300] mt-1 max-h-56 overflow-y-auto rounded-xl border border-black/10 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.15)] rp-scroll"
                      >
                        {addrSuggest.map((s, i) => (
                          <button
                            key={`${s.label}-${i}`}
                            type="button"
                            data-testid={`proposal-address-suggest-${i}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              pickAddress(s);
                            }}
                            className="flex w-full items-start gap-2 border-b border-black/5 px-3 py-2 text-left last:border-0 hover:bg-black/[0.03] transition-[background-color]"
                          >
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                            <span className="text-[12px] leading-snug text-[#14161C]">{s.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {[["relais", "Relais"], ["locker", "Locker"]].map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPType(val)}
                        data-testid={`proposal-type-${val}`}
                        className={`flex-1 rounded-full border py-2 text-xs font-semibold transition-[background-color,border-color,color] ${pType === val ? "border-[#14161C] bg-[#14161C] text-white" : "border-black/15 bg-white text-gray-600 hover:border-black/30"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea value={pComment} onChange={(e) => setPComment(e.target.value)} rows={2} maxLength={1000} placeholder="Commentaire (facultatif)" data-testid="proposal-comment-input" className={`${inputCls} resize-none`} />
                  {carriersInfo.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[12px] font-medium text-[#14161C]">Sélectionnez le ou les transporteurs prises en charge sur place parmi les transporteurs ci-dessous</p>
                      <div className="flex flex-wrap gap-1.5" data-testid="proposal-carriers">
                        {carriersInfo.map((c) => {
                          const on = pCarriers.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              data-testid={`proposal-carrier-${c.id}`}
                              onClick={() => toggleCarrier(c.id)}
                              style={on ? { background: c.color, borderColor: c.color, color: "#0B0C10" } : {}}
                              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-[background-color,border-color,color] ${on ? "font-semibold" : "border-black/15 bg-white text-gray-600 hover:border-black/40"}`}
                            >
                              <span className="h-2 w-2 rounded-full" style={{ background: on ? "#0B0C10" : c.color }} />
                              {c.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={sendProposal}
                    disabled={sending}
                    data-testid="proposal-submit-btn"
                    className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#FFCC00] py-2.5 text-sm font-semibold text-[#14161C] hover:bg-[#f5c400] disabled:opacity-60 transition-[background-color]"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Envoyer ma proposition
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Onglet Information Client */}
          {tab === "info" && (
            <div>
              {isAdmin && (
                <div className="border-b border-black/10 bg-[#F4F4F5] p-3" data-testid="announcement-form">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    <Megaphone className="h-3.5 w-3.5" /> Publier une annonce
                  </p>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Titre de l'annonce" data-testid="announcement-title-input" className={`${inputCls} mb-2`} />
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={1000} placeholder="Message (facultatif)" data-testid="announcement-body-input" className={`${inputCls} mb-2 resize-none`} />
                  <button onClick={publish} disabled={publishing} data-testid="announcement-publish-btn" className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#14161C] py-2 text-xs font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]">
                    {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Publier
                  </button>
                </div>
              )}
              <div className="max-h-80 overflow-y-auto rp-scroll">
                {items.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400" data-testid="notification-empty">
                    Aucune information pour le moment.
                  </p>
                ) : (
                  items.map((n) => (
                    <div key={n.id} className="flex gap-3 border-b border-black/5 px-4 py-3 last:border-0" data-testid="notification-item">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${n.type === "point" ? "bg-[#FFCC00]/20 text-[#8a7400]" : "bg-[#3399FF]/15 text-[#3399FF]"}`}>
                        {n.type === "point" ? <Package className="h-3.5 w-3.5" /> : <Megaphone className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#14161C]">{n.title}</p>
                        {n.body && <p className="text-[12px] leading-relaxed text-gray-600">{n.body}</p>}
                        <p className="mt-0.5 text-[10px] text-gray-400">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
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
