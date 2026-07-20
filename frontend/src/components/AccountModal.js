import { useState } from "react";
import { X, User, Settings, Loader2, KeyRound, BarChart3, Mail, Pencil, Check, Palette, Trash2, AlertTriangle, Sun, Moon } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { getTheme, setTheme as applyThemeChoice } from "@/lib/theme";
import { toast } from "sonner";

export default function AccountModal({ onClose, onOpenChangePassword, onOpenStats, onLogout }) {
  const { user, patchUser, deleteAccount } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState("profile");
  const [name, setName] = useState(user?.name || "");
  const [editName, setEditName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [email, setEmail] = useState(user?.email || "");
  const [editEmail, setEditEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [theme, setThemeState] = useState(getTheme());

  const chooseTheme = (t) => {
    setThemeState(t);
    applyThemeChoice(t);
    toast.success(t === "dark" ? "Thème sombre activé" : "Thème clair activé");
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      toast.success("Votre compte a été supprimé");
      onClose();
    } catch (err) {
      if (err.response?.status !== 401) {
        toast.error(formatApiError(err.response?.data?.detail) || "Échec de la suppression");
      }
    } finally {
      setDeleting(false);
    }
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Le nom ne peut pas être vide");
      return;
    }
    if (trimmed === (user?.name || "")) {
      setEditName(false);
      return;
    }
    setSavingName(true);
    try {
      const { data } = await api.patch("/auth/profile", { name: trimmed });
      patchUser({ name: data.name });
      setName(data.name);
      setEditName(false);
      toast.success("Nom mis à jour");
    } catch (err) {
      if (err.response?.status !== 401) {
        toast.error(formatApiError(err.response?.data?.detail) || "Échec de la mise à jour");
      }
    } finally {
      setSavingName(false);
    }
  };

  const saveEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      toast.error("Adresse email invalide");
      return;
    }
    if (trimmed === (user?.email || "")) {
      setEditEmail(false);
      return;
    }
    setSavingEmail(true);
    try {
      const { data } = await api.patch("/auth/profile", { email: trimmed });
      patchUser({ email: data.email });
      setEmail(data.email);
      setEditEmail(false);
      toast.success("Adresse email mise à jour");
    } catch (err) {
      if (err.response?.status !== 401) {
        toast.error(formatApiError(err.response?.data?.detail) || "Échec de la mise à jour");
      }
    } finally {
      setSavingEmail(false);
    }
  };

  const tabs = [
    { id: "profile", label: "Mon profil", icon: User },
    { id: "settings", label: "Paramètres", icon: Settings },
  ];

  const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-500";

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
          <div className="space-y-4 p-6" data-testid="account-profile-panel">
            <div>
              <label className={labelCls}>Nom</label>
              <div className="flex gap-2">
                <input
                  data-testid="account-name-input"
                  value={name}
                  disabled={!editName}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Votre nom"
                  className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-[border-color] ${
                    editName
                      ? "border-black/30 bg-white text-[#14161C] focus:border-black/40"
                      : "border-black/10 bg-black/[0.03] text-gray-600"
                  }`}
                />
                {!editName ? (
                  <button
                    type="button"
                    onClick={() => setEditName(true)}
                    data-testid="account-name-edit-btn"
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-black/10 bg-white px-3 text-sm font-semibold text-[#14161C] hover:bg-black/5 transition-[background-color]"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Modifier
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={saveName}
                    disabled={savingName}
                    data-testid="account-name-save-btn"
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-[#14161C] px-3 text-sm font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]"
                  >
                    {savingName ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    OK
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className={labelCls}>Adresse email</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    data-testid="account-email-input"
                    type="email"
                    value={email}
                    disabled={!editEmail}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2.5 pl-9 text-sm outline-none transition-[border-color] ${
                      editEmail
                        ? "border-black/30 bg-white text-[#14161C] focus:border-black/40"
                        : "border-black/10 bg-black/[0.03] text-gray-600"
                    }`}
                  />
                </div>
                {!editEmail ? (
                  <button
                    type="button"
                    onClick={() => setEditEmail(true)}
                    data-testid="account-email-edit-btn"
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-black/10 bg-white px-3 text-sm font-semibold text-[#14161C] hover:bg-black/5 transition-[background-color]"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Modifier
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={saveEmail}
                    disabled={savingEmail}
                    data-testid="account-email-save-btn"
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-[#14161C] px-3 text-sm font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]"
                  >
                    {savingEmail ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    OK
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenChangePassword}
              data-testid="account-profile-change-password"
              className="flex w-full items-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 text-left text-sm font-medium text-[#14161C] hover:bg-black/[0.03] transition-[background-color]"
            >
              <KeyRound className="h-4 w-4 text-gray-500" />
              Modifier mon mot de passe
            </button>
          </div>
        )}

        {/* Settings tab */}
        {tab === "settings" && (
          <div className="space-y-2 p-6" data-testid="account-settings-panel">
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
            <div
              className="rounded-xl border border-black/10 bg-white p-3"
              data-testid="account-theme"
            >
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-[#14161C]">
                <Palette className="h-4 w-4 text-gray-500" /> Thème
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => chooseTheme("light")}
                  data-testid="theme-light"
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-[background-color,border-color] ${
                    theme === "light"
                      ? "border-[#14161C] bg-[#14161C] text-white"
                      : "border-black/10 bg-white text-[#14161C] hover:bg-black/[0.03]"
                  }`}
                >
                  <Sun className="h-4 w-4" /> Clair
                </button>
                <button
                  onClick={() => chooseTheme("dark")}
                  data-testid="theme-dark"
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-[background-color,border-color] ${
                    theme === "dark"
                      ? "border-[#14161C] bg-[#14161C] text-white"
                      : "border-black/10 bg-white text-[#14161C] hover:bg-black/[0.03]"
                  }`}
                >
                  <Moon className="h-4 w-4" /> Sombre
                </button>
              </div>
            </div>

            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                data-testid="account-delete-btn"
                className="flex w-full items-center gap-3 rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-100 transition-[background-color]"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer mon compte
              </button>
            ) : (
              <div
                className="rounded-xl border border-red-500/30 bg-red-50 p-3"
                data-testid="account-delete-confirm"
              >
                <div className="mb-2 flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-xs font-medium text-red-700">
                    Supprimer définitivement votre compte et vos favoris ? Cette action est
                    irréversible.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    data-testid="account-delete-confirm-btn"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-[background-color]"
                  >
                    {deleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Oui, supprimer
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    data-testid="account-delete-cancel-btn"
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-black/5 transition-[background-color]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
