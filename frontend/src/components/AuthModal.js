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

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      data-testid="auth-modal"
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        style={{
          backgroundImage:
            "linear-gradient(rgba(11,12,16,0.85),rgba(11,12,16,0.92)), url(https://images.pexels.com/photos/31032753/pexels-photo-31032753.jpeg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-[#14161C] border border-white/10 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.6)] rp-fade-up">
        <button
          onClick={onClose}
          aria-label="Fermer"
          data-testid="auth-close-btn"
          className="absolute right-4 top-4 rounded-full bg-white/5 p-2 hover:bg-white/10 transition-[background-color]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-white p-2 text-black">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-head text-xl font-semibold tracking-tight">
              {mode === "login" ? "Bon retour" : "Créer un compte"}
            </h2>
            <p className="text-xs text-white/50">
              Enregistrez vos points relais favoris
            </p>
          </div>
        </div>

        <div className="mb-6 flex gap-1 rounded-full bg-black/40 p-1">
          {["login", "register"].map((m) => (
            <button
              key={m}
              data-testid={`auth-tab-${m}`}
              onClick={() => {
                setMode(m);
                setError("");
              }}
              className={`flex-1 rounded-full py-2 text-sm font-medium transition-[background-color,color] ${
                mode === m ? "bg-white text-black" : "text-white/60 hover:text-white"
              }`}
            >
              {m === "login" ? "Connexion" : "Inscription"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-white/50">
                Nom
              </label>
              <input
                data-testid="auth-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-white/30 focus:ring-2 focus:ring-white/20 transition-[border-color]"
                placeholder="Jean Dupont"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-white/50">
              Email
            </label>
            <input
              data-testid="auth-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-white/30 focus:ring-2 focus:ring-white/20 transition-[border-color]"
              placeholder="vous@email.fr"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-white/50">
              Mot de passe
            </label>
            <input
              data-testid="auth-password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-white/30 focus:ring-2 focus:ring-white/20 transition-[border-color]"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400" data-testid="auth-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            data-testid="auth-submit-btn"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-60 transition-[background-color]"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "login" ? "Se connecter" : "S'inscrire"}
          </button>
        </form>
      </div>
    </div>
  );
}
