import { useState } from "react";
import { X, KeyRound, Eye, EyeOff, Loader2, Save } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 6) {
      toast.error("Le nouveau mot de passe doit contenir au moins 6 caractères");
      return;
    }
    if (next !== confirm) {
      toast.error("Les deux nouveaux mots de passe ne correspondent pas");
      return;
    }
    setSaving(true);
    try {
      await api.post("/auth/change-password", {
        current_password: current,
        new_password: next,
      });
      toast.success("Mot de passe modifié avec succès");
      onClose();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Échec de la modification");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-black/40 transition-[border-color]";
  const labelCls = "mb-1 block text-[11px] font-medium text-gray-500";

  return (
    <div className="fixed inset-0 z-[2200] flex items-center justify-center p-4" data-testid="change-password-modal">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white border border-black/10 shadow-[0_20px_60px_rgba(0,0,0,0.3)] rp-fade-up">
        <div className="flex items-center justify-between border-b border-black/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#14161C]">
              <KeyRound className="h-3.5 w-3.5 text-[#FFCC00]" />
            </span>
            <h2 className="font-head text-base font-semibold tracking-tight text-[#14161C]">
              Modifier mon mot de passe
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            data-testid="change-password-close"
            className="rounded-full bg-black/5 p-2 hover:bg-black/10 transition-[background-color]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          <div>
            <label className={labelCls}>Mot de passe actuel</label>
            <div className="relative">
              <input
                data-testid="cp-current"
                type={showCurrent ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className={inputCls}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700"
                aria-label="Afficher/masquer"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Nouveau mot de passe</label>
            <div className="relative">
              <input
                data-testid="cp-new"
                type={showNext ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className={inputCls}
                placeholder="Au moins 6 caractères"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNext((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700"
                aria-label="Afficher/masquer"
              >
                {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Confirmer le nouveau mot de passe</label>
            <input
              data-testid="cp-confirm"
              type={showNext ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 transition-[border-color]"
              placeholder="Retapez le nouveau mot de passe"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            data-testid="cp-submit"
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#14161C] py-3 text-sm font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        </form>
      </div>
    </div>
  );
}
