import { useState, useRef } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function MicButton({ onResult, testid = "mic-btn" }) {
  const [state, setState] = useState("idle"); // idle | recording | transcribing
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const start = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setState("transcribing");
        try {
          const fd = new FormData();
          fd.append("audio", blob, "audio.webm");
          const { data } = await api.post("/transcribe", fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          const text = (data.text || "").trim();
          if (text) onResult(text);
          else toast.info("Aucune parole détectée, réessayez.");
        } catch {
          toast.error("Échec de la transcription vocale.");
        } finally {
          setState("idle");
        }
      };
      mr.start();
      recorderRef.current = mr;
      setState("recording");
    } catch {
      toast.error("Micro inaccessible. Autorisez l'accès au microphone.");
      setState("idle");
    }
  };

  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  if (state === "transcribing") {
    return (
      <span
        data-testid={`${testid}-loading`}
        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center"
      >
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </span>
    );
  }

  const recording = state === "recording";
  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      data-testid={testid}
      aria-label={recording ? "Arrêter la dictée" : "Dicter"}
      title={recording ? "Arrêter" : "Dicter à la voix"}
      className={`absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full transition-[background-color,color] ${
        recording
          ? "animate-pulse bg-red-500 text-white"
          : "bg-black/5 text-gray-500 hover:bg-black/10 hover:text-[#14161C]"
      }`}
    >
      {recording ? <Square className="h-3 w-3" fill="currentColor" /> : <Mic className="h-3.5 w-3.5" />}
    </button>
  );
}
