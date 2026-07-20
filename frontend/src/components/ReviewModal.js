import { useState } from "react";
import { X, Star, MessageSquare, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

export default function ReviewModal({ onClose }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (rating < 1) {
      setError("Merci de sélectionner une note.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.post("/reviews", { rating, comment });
      setDone(true);
      setTimeout(onClose, 1600);
    } catch {
      setError("Une erreur est survenue. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2300] flex items-end justify-center p-0 sm:items-center sm:p-4" data-testid="review-modal">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white border border-black/10 shadow-[0_20px_60px_rgba(0,0,0,0.3)] rp-fade-up">
        <div className="flex items-center justify-between border-b border-black/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#14161C]">
              <MessageSquare className="h-3.5 w-3.5 text-[#FFCC00]" />
            </span>
            <h2 className="font-head text-base font-semibold tracking-tight text-[#14161C]">
              Laisser votre avis
            </h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" data-testid="review-close" className="rounded-full bg-black/5 p-2 hover:bg-black/10 transition-[background-color]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" data-testid="review-success">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-sm font-medium text-[#14161C]">Merci pour votre avis !</p>
          </div>
        ) : (
          <div className="space-y-5 p-6">
            <div>
              <p className="mb-2 text-sm font-medium text-[#14161C]">Votre note</p>
              <div className="flex items-center gap-1.5" data-testid="review-stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    data-testid={`review-star-${n}`}
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star className={`h-8 w-8 ${n <= (hover || rating) ? "fill-[#FFCC00] text-[#FFCC00]" : "text-gray-300"}`} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-[#14161C]">Votre commentaire (facultatif)</p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={2000}
                data-testid="review-comment"
                placeholder="Dites-nous ce que vous pensez de l'application…"
                className="w-full resize-none rounded-xl border border-black/10 bg-[#F4F4F5] p-3 text-sm text-[#14161C] outline-none focus:border-[#3399FF] transition-[border-color]"
              />
            </div>

            {error && <p className="text-sm text-red-500" data-testid="review-error">{error}</p>}

            <button
              onClick={submit}
              disabled={loading}
              data-testid="review-submit"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#14161C] px-4 py-3 text-sm font-semibold text-white hover:bg-[#2a2d36] transition-[background-color] disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
              Envoyer mon avis
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
