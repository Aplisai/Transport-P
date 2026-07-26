import { useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { X, Download, Upload, Loader2, Check, AlertTriangle, FileSpreadsheet } from "lucide-react";

export default function CsvImportModal({ onClose, onImported }) {
  const [downloading, setDownloading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState({});

  const exportCsv = async () => {
    setDownloading(true);
    try {
      const res = await api.get("/admin/points/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "points_relais.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Export CSV téléchargé");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Échec de l'export");
    } finally {
      setDownloading(false);
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setParsing(true);
    setRows([]);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/admin/points/import-preview", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const list = data.rows || [];
      setRows(list);
      const init = {};
      list.forEach((r, i) => (init[i] = r.valid)); // valides cochés par défaut
      setSelected(init);
      if (!list.length) toast.info("Aucune ligne trouvée dans le fichier.");
      else toast.success(`${list.length} ligne(s) analysée(s) — validez celles à ajouter`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Échec de l'analyse du fichier");
    } finally {
      setParsing(false);
    }
  };

  const toggle = (i) => setSelected((s) => ({ ...s, [i]: !s[i] }));

  const commit = async () => {
    const chosen = rows.filter((r, i) => selected[i] && r.valid);
    if (!chosen.length) {
      toast.error("Sélectionnez au moins un point valide à ajouter");
      return;
    }
    setCommitting(true);
    try {
      const { data } = await api.post("/admin/points/import-commit", {
        points: chosen.map((r) => ({
          name: r.name,
          type: r.type,
          carriers: r.carriers,
          address: r.address,
          postal_code: r.postal_code,
          city: r.city,
          lat: r.lat,
          lng: r.lng,
          phone: r.phone,
          hours: r.hours,
        })),
      });
      toast.success(`${data.created} point(s) ajouté(s)`);
      setRows([]);
      setSelected({});
      onImported && onImported();
      onClose();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Échec de l'import");
    } finally {
      setCommitting(false);
    }
  };

  const validCount = rows.filter((r) => r.valid).length;
  const selectedCount = rows.filter((r, i) => selected[i] && r.valid).length;

  return (
    <div className="fixed inset-0 z-[2200] flex items-end justify-center p-0 sm:items-center sm:p-4" data-testid="csv-modal">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.4)] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <h2 className="flex items-center gap-2 font-head text-base font-semibold tracking-tight text-[#14161C]">
            <FileSpreadsheet className="h-4 w-4 text-[#3399FF]" /> Import / Export CSV
          </h2>
          <button type="button" onClick={onClose} data-testid="csv-close-btn" className="rounded-full bg-black/5 p-2 hover:bg-black/10 transition-[background-color]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto rp-scroll p-5">
          {/* Export + Import actions */}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={exportCsv}
              disabled={downloading}
              data-testid="csv-export-btn"
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-black/10 bg-white py-3 text-sm font-semibold text-[#14161C] hover:bg-black/5 disabled:opacity-60 transition-[background-color]"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exporter tous les points (CSV)
            </button>
            <label
              data-testid="csv-import-label"
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#14161C] py-3 text-sm font-semibold text-white hover:bg-[#2a2d36] transition-[background-color]"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importer un fichier CSV
              <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={parsing} data-testid="csv-file-input" className="hidden" />
            </label>
          </div>

          <p className="mb-4 rounded-lg bg-black/[0.03] px-3 py-2 text-[11px] leading-relaxed text-gray-500">
            Colonnes attendues (séparateur <b>;</b>) : name, type (relais/locker), carriers (séparés par <b>|</b>),
            address, postal_code, city, lat, lng, phone, hours_lun … hours_dim. Astuce : exportez d'abord pour obtenir le modèle.
          </p>

          {/* Preview list */}
          {rows.length > 0 && (
            <div data-testid="csv-preview">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Aperçu — {selectedCount}/{validCount} sélectionné(s)
                </span>
              </div>
              <div className="space-y-1.5">
                {rows.map((r, i) => (
                  <div
                    key={i}
                    data-testid={`csv-row-${i}`}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
                      !r.valid
                        ? "border-red-200 bg-red-50"
                        : selected[i]
                        ? "border-[#3399FF]/40 bg-[#3399FF]/5"
                        : "border-black/10 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!selected[i] && r.valid}
                      disabled={!r.valid}
                      onChange={() => toggle(i)}
                      data-testid={`csv-row-check-${i}`}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#3399FF] disabled:opacity-40"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#14161C]">{r.name || "(sans nom)"}</p>
                      <p className="truncate text-[11px] text-gray-500">
                        {[r.address, r.postal_code, r.city].filter(Boolean).join(", ") || "—"}
                        {" · "}
                        {r.type} · {(r.carriers || []).join(", ")}
                      </p>
                      {!r.valid && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-red-600">
                          <AlertTriangle className="h-3 w-3" /> {r.errors.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="border-t border-black/10 p-4">
            <button
              onClick={commit}
              disabled={committing || selectedCount === 0}
              data-testid="csv-commit-btn"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#FFCC00] py-3 text-sm font-bold text-[#14161C] hover:bg-[#f5c400] disabled:opacity-50 transition-[background-color]"
            >
              {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Ajouter les {selectedCount} point(s) sélectionné(s)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
