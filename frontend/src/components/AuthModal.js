import { useState, useEffect } from "react";
import { X, Package, Loader2, Eye, EyeOff } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function AuthModal({ onClose }) {
  const { onAuthed } = useAuth();
  useEffect(() => {
    toast.dismiss();
  }, []);
  const [mode, setMode] = useState("login"); // login | register | forgot | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loginWithGoogle = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const submitAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload =
        mode === "login" ? { email, password } : { email, password, name };
      const { data } = await api.post(`/auth/${mode}`, payload);
      await onAuthed(data);
      toast.success(mode === "login" ? "Connexion réussie" : "Compte créé");
      onClose();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      if (data.reset_token) {
        setResetToken(data.reset_token);
        setMode("reset");
        toast.success("Code de réinitialisation généré");
      } else {
        toast.info(data.message || "Si ce compte existe, un code a été généré.");
      }
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { token: resetToken, password: newPwd });
      toast.success("Mot de passe réinitialisé");
      setPassword("");
      setNewPwd("");
      setMode("login");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-xl bg-black/[0.03] border border-black/10 px-4 py-3 text-sm text-[#14161C] outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10 transition-[border-color]";
  const labelCls = "mb-1 block text-xs uppercase tracking-wider text-gray-500";

  const titles = {
    login: "En route",
    register: "Créer un compte",
    forgot: "Mot de passe oublié",
    reset: "Nouveau mot de passe",
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      data-testid="auth-modal"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        style={{
          backgroundImage:
            "linear-gradient(rgba(238,241,245,0.6),rgba(238,241,245,0.75)), url(https://images.pexels.com/photos/31032753/pexels-photo-31032753.jpeg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white border border-black/10 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.18)] rp-fade-up">
        <button
          onClick={onClose}
          aria-label="Fermer"
          data-testid="auth-close-btn"
          className="absolute right-4 top-4 rounded-full bg-black/5 p-2 hover:bg-black/10 transition-[background-color]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-[#14161C] p-2 text-white">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-head text-xl font-semibold tracking-tight text-[#14161C]">
              {titles[mode]}
            </h2>
            <p className="text-xs text-gray-500">
              {mode === "reset"
                ? "Choisissez un nouveau mot de passe"
                : mode === "forgot"
                ? "Recevez un code pour réinitialiser"
                : "Enregistrez vos points relais favoris"}
            </p>
          </div>
        </div>

        {(mode === "login" || mode === "register") && (
          <>
            <div className="mb-6 flex gap-1 rounded-full bg-black/5 p-1">
              {["login", "register"].map((m) => (
                <button
                  key={m}
                  data-testid={`auth-tab-${m}`}
                  onClick={() => {
                    setMode(m);
                    setError("");
                  }}
                  className={`flex-1 rounded-full py-2 text-sm font-medium transition-[background-color,color] ${
                    mode === m
                      ? "bg-[#14161C] text-white"
                      : "text-gray-500 hover:text-[#14161C]"
                  }`}
                >
                  {m === "login" ? "Connexion" : "Inscription"}
                </button>
              ))}
            </div>

            <form onSubmit={submitAuth} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label className={labelCls}>Nom</label>
                  <input
                    data-testid="auth-name-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className={inputCls}
                    placeholder="Jean Dupont"
                  />
                </div>
              )}
              <div>
                <label className={labelCls}>Email</label>
                <input
                  data-testid="auth-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={inputCls}
                  placeholder="vous@email.fr"
                />
              </div>
              <div>
                <label className={labelCls}>Mot de passe</label>
                <div className="relative">
                  <input
                    data-testid="auth-password-input"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className={inputCls + " pr-11"}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    data-testid="toggle-password-visibility"
                    aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:text-[#14161C] transition-[color]"
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {mode === "login" && (
                <button
                  type="button"
                  data-testid="forgot-password-btn"
                  onClick={() => {
                    setMode("forgot");
                    setError("");
                  }}
                  className="text-xs font-medium text-[#14161C] underline underline-offset-2 hover:text-[#2a2d36]"
                >
                  Mot de passe oublié ?
                </button>
              )}

              {error && (
                <p className="text-sm text-red-500" data-testid="auth-error">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                data-testid="auth-submit-btn"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#14161C] py-3 text-sm font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "login" ? "Se connecter" : "S'inscrire"}
              </button>
            </form>

            {/* Séparateur */}
            <div className="my-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-black/10" />
              <span className="text-xs font-medium text-gray-400">ou</span>
              <span className="h-px flex-1 bg-black/10" />
            </div>

            {/* Connexion Google (email vérifié automatiquement) */}
            <button
              type="button"
              onClick={loginWithGoogle}
              data-testid="google-auth-btn"
              className="flex w-full items-center justify-center gap-2.5 rounded-full border border-black/15 bg-white py-3 text-sm font-semibold text-[#14161C] hover:bg-black/[0.03] transition-[background-color]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/>
              </svg>
              Continuer avec Google
            </button>
          </>
        )}

        {mode === "forgot" && (
          <form onSubmit={submitForgot} className="space-y-4">
            <div>
              <label className={labelCls}>Email du compte</label>
              <input
                data-testid="forgot-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputCls}
                placeholder="vous@email.fr"
              />
            </div>
            {error && (
              <p className="text-sm text-red-500" data-testid="auth-error">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              data-testid="forgot-submit-btn"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#14161C] py-3 text-sm font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Obtenir un code
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className="w-full text-center text-xs font-medium text-gray-500 hover:text-[#14161C]"
            >
              Retour à la connexion
            </button>
          </form>
        )}

        {mode === "reset" && (
          <form onSubmit={submitReset} className="space-y-4">
            <div className="rounded-xl border border-[#00E676]/40 bg-[#00E676]/10 px-3 py-2.5 text-xs text-[#14161C]">
              Code de réinitialisation généré. Il est pré-rempli ci-dessous (mode sans e-mail).
            </div>
            <div>
              <label className={labelCls}>Code de réinitialisation</label>
              <input
                data-testid="reset-token-input"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Nouveau mot de passe</label>
              <div className="relative">
                <input
                  data-testid="reset-password-input"
                  type={showPwd ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  required
                  minLength={6}
                  className={inputCls + " pr-11"}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  data-testid="toggle-reset-password-visibility"
                  aria-label="Afficher le mot de passe"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:text-[#14161C] transition-[color]"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-500" data-testid="auth-error">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              data-testid="reset-submit-btn"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#14161C] py-3 text-sm font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Réinitialiser le mot de passe
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
