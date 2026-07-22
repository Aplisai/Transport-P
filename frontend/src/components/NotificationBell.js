import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, X, Package, Megaphone, Send, Loader2 } from "lucide-react";
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

export const NotificationBell = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publishing, setPublishing] = useState(false);
  const ref = useRef(null);

  const fetchNotifs = useCallback(() => {
    api
      .get("/notifications")
      .then(({ data }) => {
        setItems(data.notifications || []);
        setUnread(data.unread || 0);
      })
      .catch(() => {});
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
    if (next && unread > 0) {
      api.post("/notifications/read").then(() => setUnread(0)).catch(() => {});
    }
  };

  const publish = async () => {
    if (!title.trim()) {
      toast.error("Le titre est obligatoire");
      return;
    }
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

  if (!user) return null;

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
          className="absolute left-0 top-11 z-[1200] w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        >
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <span className="flex items-center gap-1.5 font-head text-sm font-semibold text-[#14161C]">
              <Bell className="h-4 w-4" /> Notifications
            </span>
            <button onClick={() => setOpen(false)} aria-label="Fermer" className="rounded-full p-1 hover:bg-black/5 transition-[background-color]">
              <X className="h-4 w-4" />
            </button>
          </div>

          {isAdmin && (
            <div className="border-b border-black/10 bg-[#F4F4F5] p-3" data-testid="announcement-form">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                <Megaphone className="h-3.5 w-3.5" /> Publier une annonce
              </p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Titre de l'annonce"
                data-testid="announcement-title-input"
                className="mb-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/30 transition-[border-color]"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Message (facultatif)"
                data-testid="announcement-body-input"
                className="mb-2 w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/30 transition-[border-color]"
              />
              <button
                onClick={publish}
                disabled={publishing}
                data-testid="announcement-publish-btn"
                className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#14161C] py-2 text-xs font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]"
              >
                {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Publier
              </button>
            </div>
          )}

          <div className="max-h-80 overflow-y-auto rp-scroll">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400" data-testid="notification-empty">
                Aucune notification pour le moment.
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
  );
};
