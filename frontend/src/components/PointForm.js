import { useState, useRef } from "react";
import { X, Save, Trash2, Loader2, Plus, Store, Box, MapPin, Camera, AlertTriangle } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import MicButton from "@/components/MicButton";

const CODES = {
  mondial_relay: "MR",
  chronopost: "CH",
  la_poste: "LP",
  dpd: "DPD",
  ups: "UPS",
  relais_colis: "RC",
  colis_prive: "CP",
  vinted_go: "VG",
  amazon: "AZ",
  dhl: "DHL",
  gls: "GLS",
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const _normStr = (s) =>
  (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export default function PointForm({ point, carriersInfo = [], existingPoints = [], onSaved, onDeleted, onClose }) {
  const isEdit = !!point;
  const [name, setName] = useState(point?.name || "");
  const [type, setType] = useState(point?.type || "relais");
  const initialCarriers =
    point?.carriers && point.carriers.length
      ? point.carriers
      : point?.carrier
      ? [point.carrier]
      : [carriersInfo[0]?.id].filter(Boolean);
  const [carrier, setCarrier] = useState(point?.carrier || initialCarriers[0] || "mondial_relay");
  const [carriers, setCarriers] = useState(initialCarriers);
  const [address, setAddress] = useState(point?.address || "");
  const [postalCode, setPostalCode] = useState(point?.postal_code || "");
  const [city, setCity] = useState(point?.city || "");
  const [phone, setPhone] = useState(point?.phone || "");
  const [lat, setLat] = useState(point?.lat ?? "");
  const [lng, setLng] = useState(point?.lng ?? "");
  const [hLunVen, setHLunVen] = useState(point?.hours?.["lun-ven"] || "");
  const [hSam, setHSam] = useState(point?.hours?.sam || "");
  const [hDim, setHDim] = useState(point?.hours?.dim || "");
  const [photo, setPhoto] = useState(point?.photo || "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dupWarning, setDupWarning] = useState(null);
  const [dupConfirmed, setDupConfirmed] = useState(false);
  const [addrSug, setAddrSug] = useState([]);
  const [showAddrSug, setShowAddrSug] = useState(false);
  const [searchingAddr, setSearchingAddr] = useState(false);
  const addrDebounce = useRef(null);

  const onAddressChange = (val) => {
    setAddress(val);
    setDupWarning(null);
    setDupConfirmed(false);
    if (addrDebounce.current) clearTimeout(addrDebounce.current);
    if (val.trim().length < 3) {
      setAddrSug([]);
      setShowAddrSug(false);
      return;
    }
    setSearchingAddr(true);
    addrDebounce.current = setTimeout(async () => {
      try {
        const q = [val.trim(), postalCode.trim(), city.trim()].filter(Boolean).join(" ");
        const { data } = await api.get("/address-suggest", { params: { q } });
        setAddrSug(data);
        setShowAddrSug(data.length > 0);
      } catch {
        setAddrSug([]);
        setShowAddrSug(false);
      } finally {
        setSearchingAddr(false);
      }
    }, 350);
  };

  const pickAddress = (s) => {
    if (s.address) setAddress(s.address);
    if (s.postal_code) setPostalCode(s.postal_code);
    if (s.city) setCity(s.city);
    setLat(String(s.lat));
    setLng(String(s.lng));
    setShowAddrSug(false);
    setAddrSug([]);
    setDupWarning(null);
    setDupConfirmed(false);
  };

  const uploadPhoto = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      toast.error("Image trop volumineuse (max 8 Mo)");
      return;
    }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/admin/upload-photo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPhoto(data.url);
      toast.success("Photo ajoutée");
    } catch (err) {
      if (err.response?.status !== 401)
        toast.error(formatApiError(err.response?.data?.detail) || "Échec de l'envoi de la photo");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const toggleCarrier = (id) => {
    setCarriers((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
      return next.length ? next : prev;
    });
  };

  const submit = async (e, force = false) => {
    if (e) e.preventDefault();
    let latN = parseFloat(lat);
    let lngN = parseFloat(lng);
    // Coordonnées manquantes -> géocodage automatique depuis l'adresse
    if (isNaN(latN) || isNaN(lngN)) {
      const addr = [address.trim(), postalCode.trim(), city.trim()].filter(Boolean).join(", ");
      if (addr) {
        setSaving(true);
        try {
          const { data } = await api.get("/geocode", { params: { q: `${addr}, France` } });
          if (data.lat != null) {
            latN = data.lat;
            lngN = data.lng;
            setLat(String(data.lat));
            setLng(String(data.lng));
          }
        } catch {
          /* ignore, message ci-dessous */
        }
        setSaving(false);
      }
      if (isNaN(latN) || isNaN(lngN)) {
        toast.error(
          "Impossible de localiser l'adresse. Renseignez une adresse plus précise (rue, code postal, ville) ou saisissez la latitude/longitude."
        );
        return;
      }
    }
    // Détection de doublon d'adresse (sauf si l'admin a confirmé)
    if (!force && !dupConfirmed) {
      const na = _normStr(address);
      const pc = postalCode.trim();
      const dup = existingPoints.find((p) => {
        if (isEdit && point && p.id === point.id) return false;
        const sameAddr = na && pc && _normStr(p.address) === na && String(p.postal_code || "").trim() === pc;
        const closeCoord =
          p.lat != null &&
          Math.abs(p.lat - latN) < 0.0004 &&
          Math.abs(p.lng - lngN) < 0.0004;
        return sameAddr || closeCoord;
      });
      if (dup) {
        setDupWarning(dup);
        return;
      }
    }
    const carrierList = carriers.includes(carrier) ? carriers : [carrier, ...carriers];
    const payload = {
      name: name.trim(),
      type,
      carrier,
      carriers: carrierList,
      address: address.trim(),
      postal_code: postalCode.trim(),
      city: city.trim(),
      phone: phone.trim(),
      lat: latN,
      lng: lngN,
      hours: { "lun-ven": hLunVen.trim(), sam: hSam.trim(), dim: hDim.trim() },
      photo: photo || "",
    };
    setSaving(true);
    try {
      const { data } = isEdit
        ? await api.put(`/admin/points/${point.id}`, payload)
        : await api.post("/admin/points", payload);
      toast.success(isEdit ? "Point relais modifié" : "Point relais ajouté");
      onSaved && onSaved(data);
      onClose();
    } catch (err) {
      if (err.response?.status !== 401) {
        toast.error(formatApiError(err.response?.data?.detail) || "Échec de l'enregistrement");
      }
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/admin/points/${point.id}`);
      toast.success("Point relais supprimé");
      onDeleted && onDeleted(point.id);
      onClose();
    } catch (err) {
      if (err.response?.status !== 401) {
        toast.error(formatApiError(err.response?.data?.detail) || "Échec de la suppression");
      }
    } finally {
      setDeleting(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 transition-[border-color]";
  const micInputCls =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-black/40 transition-[border-color]";
  const labelCls = "mb-1 block text-[11px] font-medium text-gray-500";

  return (
    <div className="fixed inset-0 z-[2100] flex items-end justify-center sm:items-center p-0 sm:p-4" data-testid="point-form">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white border border-black/10 shadow-[0_20px_60px_rgba(0,0,0,0.3)] rp-fade-up max-h-[92vh] overflow-y-auto rp-scroll">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-white/95 px-6 py-4 backdrop-blur">
          <h2 className="font-head text-lg font-semibold tracking-tight text-[#14161C]" data-testid="point-form-title">
            {isEdit ? "Éditer le point" : "Ajouter un point relais"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            data-testid="point-form-close"
            className="rounded-full bg-black/5 p-2 hover:bg-black/10 transition-[background-color]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          {/* Name */}
          <div>
            <label className={labelCls}>Nom du point</label>
            <div className="relative">
              <input data-testid="form-name" value={name} onChange={(e) => setName(e.target.value)} className={micInputCls} placeholder="Ex : Tabac Presse du Centre" />
              <MicButton testid="mic-name" onResult={(t) => setName(t)} />
            </div>
          </div>

          {/* Photo */}
          <div>
            <label className={labelCls}>Photo du point</label>
            {photo ? (
              <div className="relative overflow-hidden rounded-xl border border-black/10" data-testid="photo-preview">
                <img
                  src={`${BACKEND_URL}${photo}`}
                  alt="Point relais"
                  className="h-40 w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPhoto("")}
                  data-testid="photo-remove"
                  aria-label="Retirer la photo"
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-[background-color]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label
                data-testid="photo-upload-label"
                className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/20 bg-black/[0.02] py-6 text-center transition-[background-color] hover:bg-black/[0.05]"
              >
                {uploadingPhoto ? (
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                ) : (
                  <Camera className="h-5 w-5 text-gray-400" />
                )}
                <span className="text-xs font-medium text-gray-500">
                  {uploadingPhoto ? "Envoi en cours…" : "Ajouter une photo (JPG, PNG, WebP)"}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={uploadPhoto}
                  disabled={uploadingPhoto}
                  data-testid="photo-input"
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Type */}
          <div>
            <label className={labelCls}>Type</label>
            <div className="flex gap-1 rounded-full bg-black/5 p-1">
              {[
                { id: "relais", label: "Point relais", icon: Store },
                { id: "locker", label: "Locker", icon: Box },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`form-type-${t.id}`}
                    onClick={() => setType(t.id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium transition-[background-color,color] ${
                      type === t.id ? "bg-[#14161C] text-white" : "text-gray-500 hover:text-[#14161C]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Principal carrier */}
          <div>
            <label className={labelCls}>Transporteur principal (couleur du marqueur)</label>
            <select data-testid="form-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} className={inputCls}>
              {carriersInfo.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Carriers handled */}
          <div>
            <label className={labelCls}>Transporteurs pris en charge</label>
            <div className="flex flex-wrap gap-2" data-testid="form-carriers">
              {carriersInfo.map((c) => {
                const on = carriers.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`form-carrier-chip-${c.id}`}
                    onClick={() => toggleCarrier(c.id)}
                    style={on ? { background: c.color, borderColor: c.color, color: "#0B0C10" } : {}}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-[background-color,border-color,color] ${
                      on ? "font-semibold" : "border-black/15 bg-white text-gray-600 hover:border-black/40"
                    }`}
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded text-[8px] font-extrabold text-white" style={{ background: on ? "#0B0C10" : c.color }}>
                      {CODES[c.id] || c.name.slice(0, 2).toUpperCase()}
                    </span>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Address with autocomplete */}
          <div className="relative">
            <label className={labelCls}>Adresse</label>
            <div className="relative">
              <input
                data-testid="form-address"
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
                onFocus={() => addrSug.length && setShowAddrSug(true)}
                onBlur={() => setTimeout(() => setShowAddrSug(false), 180)}
                autoComplete="off"
                className={micInputCls}
                placeholder="Commencez à taper, ex : 12 rue de la Paix…"
              />
              {searchingAddr ? (
                <Loader2 className="absolute right-9 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
              ) : null}
              <MicButton testid="mic-address" onResult={(t) => onAddressChange(t)} />
            </div>
            {showAddrSug && addrSug.length > 0 && (
              <div
                data-testid="addr-suggestions"
                className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-[0_12px_30px_rgba(0,0,0,0.15)] rp-scroll"
              >
                {addrSug.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    data-testid={`addr-sug-${i}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickAddress(s)}
                    className="flex w-full items-start gap-2 border-b border-black/5 px-3 py-2 text-left text-xs last:border-0 hover:bg-black/5 transition-[background-color]"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF3366]" />
                    <span className="text-[#14161C]">{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <div className="w-1/3">
              <label className={labelCls}>Code postal</label>
              <div className="relative">
                <input data-testid="form-postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={micInputCls} placeholder="75001" />
                <MicButton testid="mic-postal" onResult={(t) => setPostalCode(t.replace(/\D/g, ""))} />
              </div>
            </div>
            <div className="flex-1">
              <label className={labelCls}>Ville</label>
              <div className="relative">
                <input data-testid="form-city" value={city} onChange={(e) => setCity(e.target.value)} className={micInputCls} placeholder="Paris" />
                <MicButton testid="mic-city" onResult={(t) => setCity(t)} />
              </div>
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className={labelCls}>Téléphone</label>
            <div className="relative">
              <input data-testid="form-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={micInputCls} placeholder="01 23 45 67 89" />
              <MicButton testid="mic-phone" onResult={(t) => setPhone(t)} />
            </div>
          </div>

          {/* Coordinates */}
          <div>
            <p className="mb-1 text-[11px] text-gray-400">
              Coordonnées GPS — laissez vide pour un calcul automatique depuis l'adresse
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className={labelCls}>Latitude</label>
                <input data-testid="form-lat" type="number" step="0.000001" value={lat} onChange={(e) => setLat(e.target.value)} className={inputCls} placeholder="Auto depuis l'adresse" />
              </div>
              <div className="flex-1">
                <label className={labelCls}>Longitude</label>
                <input data-testid="form-lng" type="number" step="0.000001" value={lng} onChange={(e) => setLng(e.target.value)} className={inputCls} placeholder="Auto depuis l'adresse" />
              </div>
            </div>
          </div>

          {/* Hours */}
          <div>
            <label className={labelCls}>Horaires d'ouverture</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-gray-500">Lundi – Vendredi</span>
                <div className="relative flex-1">
                  <input data-testid="form-hours-lunven" value={hLunVen} onChange={(e) => setHLunVen(e.target.value)} className={micInputCls} placeholder="09h00 – 19h00" />
                  <MicButton testid="mic-hours-lunven" onResult={(t) => setHLunVen(t)} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-gray-500">Samedi</span>
                <div className="relative flex-1">
                  <input data-testid="form-hours-sam" value={hSam} onChange={(e) => setHSam(e.target.value)} className={micInputCls} placeholder="09h00 – 12h00" />
                  <MicButton testid="mic-hours-sam" onResult={(t) => setHSam(t)} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-gray-500">Dimanche</span>
                <div className="relative flex-1">
                  <input data-testid="form-hours-dim" value={hDim} onChange={(e) => setHDim(e.target.value)} className={micInputCls} placeholder="Fermé" />
                  <MicButton testid="mic-hours-dim" onResult={(t) => setHDim(t)} />
                </div>
              </div>
            </div>
          </div>

          {/* Duplicate address warning */}
          {dupWarning && (
            <div
              data-testid="dup-warning"
              className="rounded-xl border border-[#FFCC00]/70 bg-[#FFCC00]/15 p-3"
            >
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[#8a6d00]">
                <AlertTriangle className="h-4 w-4" /> Adresse déjà utilisée
              </p>
              <p className="mb-2 text-xs text-[#14161C]">
                Un point existe déjà à cette adresse :{" "}
                <b>{dupWarning.name || "Sans nom"}</b>
                {dupWarning.address ? ` — ${dupWarning.address}` : ""}
                {dupWarning.postal_code ? `, ${dupWarning.postal_code}` : ""}
                {dupWarning.city ? ` ${dupWarning.city}` : ""}. Voulez-vous quand même l'ajouter ?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="dup-confirm-btn"
                  onClick={() => {
                    setDupConfirmed(true);
                    setDupWarning(null);
                    submit(null, true);
                  }}
                  className="flex-1 rounded-full bg-[#14161C] py-2 text-xs font-semibold text-white hover:bg-[#2a2d36] transition-[background-color]"
                >
                  Ajouter quand même
                </button>
                <button
                  type="button"
                  data-testid="dup-cancel-btn"
                  onClick={() => setDupWarning(null)}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-black/5 transition-[background-color]"
                >
                  Modifier l'adresse
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              data-testid="form-save-btn"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#14161C] py-3 text-sm font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {isEdit ? "Enregistrer" : "Ajouter le point"}
            </button>
            {isEdit && !confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                data-testid="form-delete-btn"
                className="flex items-center justify-center gap-1.5 rounded-full border border-red-500/30 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 transition-[background-color]"
              >
                <Trash2 className="h-4 w-4" /> Supprimer
              </button>
            )}
          </div>

          {isEdit && confirmDelete && (
            <div className="rounded-xl border border-red-500/30 bg-red-50 p-3" data-testid="form-delete-confirm">
              <p className="mb-2 text-xs font-medium text-red-700">
                Supprimer définitivement ce point ? Cette action est irréversible.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={doDelete}
                  disabled={deleting}
                  data-testid="form-delete-confirm-btn"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-[background-color]"
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Oui, supprimer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-black/5 transition-[background-color]"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
