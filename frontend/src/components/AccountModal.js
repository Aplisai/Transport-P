import { useState } from "react";
import { X, User, Settings, Save, Loader2, KeyRound, BarChart3, LogOut, Mail, Shield } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function AccountModal({ onClose, onOpenChangePassword, onOpenStats, onLogout }) {
  const { user, patchUser } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState("profile");
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Le nom ne peut pas être vide");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.patch("/auth/profile", { name: trimmed });
      patchUser({ name: data.name });
      toast.success("Profil mis à jour");
    } catch (err) {
      if (err.response?.status !== 401) {
        toast.error(formatApiError(err.response?.data?.detail) || "Échec de la mise à jour");
      }
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "profile", label: "Mon profil", icon: User },
    { id: "settings", label: "Paramètres", icon: Settings },
  ];

  const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-500";
  const inputCls =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-[#14161C] outline-none focus:border-black/40 transition-[border-color]";

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      data-testid="account-modal"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-white border border-black/10 shadow-[0_20px_60px_rgba(0,0,0,0.3)] rp-fade-up sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#14161C]">
              <User className="h-3.5 w-3.5 text-[#FFCC00]" />
            </span>
            <h2 className="font-head text-base font-semibold tracking-tight text-[#14161C]">
              Mon compte
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            data-testid="account-close-btn"
            className="rounded-full bg-black/5 p-2 hover:bg-black/10 transition-[background-color]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-full bg-black/5 p-1 mx-6 mt-4">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                data-testid={`account-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium transition-[background-color,color] ${
                  tab === t.id ? "bg-[#14161C] text-white" : "text-gray-500 hover:text-[#14161C]"
                }`}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Profile tab */}
        {tab === "profile" && (
          <form onSubmit={saveProfile} className="space-y-4 p-6" data-testid="account-profile-panel">
            <div>
              <label className={labelCls}>Nom</label>
              <input
                data-testid="account-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className={inputCls}
                placeholder="Votre nom"
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2.5 text-sm text-gray-600">
                <Mail className="h-4 w-4 text-gray-400" />
                <span data-testid="account-email">{user?.email}</span>
              </div>
            </div>
            <div>
              <label className={labelCls}>Rôle</label>
              <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2.5 text-sm text-gray-600">
                <Shield className="h-4 w-4 text-gray-400" />
                <span data-testid="account-role">
                  {isAdmin ? "Administrateur" : "Utilisateur"}
                </span>
              </div>
            </div>
            <button
              type="submit"
              disabled={saving || name.trim() === (user?.name || "")}
              data-testid="account-save-btn"
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#14161C] py-3 text-sm font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-50 transition-[background-color]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </button>
          </form>
        )}

        {/* Settings tab */}
        {tab === "settings" && (
          <div className="space-y-2 p-6" data-testid="account-settings-panel">
            <button
              onClick={onOpenChangePassword}
              data-testid="account-change-password"
              className="flex w-full items-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 text-left text-sm font-medium text-[#14161C] hover:bg-black/[0.03] transition-[background-color]"
            >
              <KeyRound className="h-4 w-4 text-gray-500" />
              Modifier mon mot de passe
            </button>
            {isAdmin && (
              <button
                onClick={onOpenStats}
                data-testid="account-stats"
                className="flex w-full items-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 text-left text-sm font-medium text-[#14161C] hover:bg-black/[0.03] transition-[background-color]"
              >
                <BarChart3 className="h-4 w-4 text-gray-500" />
                Statistiques d'audience
              </button>
            )}
            <button
              onClick={onLogout}
              data-testid="account-logout"
              className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-100 transition-[background-color]"
            >
              <LogOut className="h-4 w-4" />
              Se déconnecter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
