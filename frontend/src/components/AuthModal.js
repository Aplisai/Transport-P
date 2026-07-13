import { useState } from "react";
import { X, Package, Loader2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function AuthModal({ onClose }) {
  const { onAuthed } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
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

  const inputCls =
    "w-full rounded-xl bg-black/[0.03] border border-black/10 px-4 py-3 text-sm text-[#14161C] outline-none focus:border-black/30 focus:ring-2 focus:ring-black/10 transition-[border-color]";
  const labelCls = "mb-1 block text-xs uppercase tracking-wider text-gray-500";

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
              {mode === "login" ? "En route" : "Créer un compte"}
            </h2>
            <p className="text-xs text-gray-500">
              Enregistrez vos points relais favoris
            </p>
          </div>
        </div>

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

        <form onSubmit={submit} className="space-y-4">
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
            <input
              data-testid="auth-password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className={inputCls}
              placeholder="••••••••"
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
            data-testid="auth-submit-btn"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#14161C] py-3 text-sm font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "login" ? "Se connecter" : "S'inscrire"}
          </button>
        </form>
      </div>
    </div>
  );
}
