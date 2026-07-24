import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { X, Check, Loader2, ZoomIn, RotateCw } from "lucide-react";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function getCroppedBlob(src, area, rotation = 0) {
  const image = await loadImage(src);
  const rad = (rotation * Math.PI) / 180;

  // Canvas intermédiaire à la taille de l'image (avec rotation éventuelle)
  const safe = Math.max(image.width, image.height) * 2;
  const tmp = document.createElement("canvas");
  tmp.width = safe;
  tmp.height = safe;
  const tctx = tmp.getContext("2d");
  tctx.translate(safe / 2, safe / 2);
  tctx.rotate(rad);
  tctx.drawImage(image, -image.width / 2, -image.height / 2);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    tmp,
    safe / 2 - image.width / 2 + area.x,
    safe / 2 - image.height / 2 + area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height
  );
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9));
}

export default function ImageCropModal({ src, onCancel, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [areaPixels, setAreaPixels] = useState(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_, px) => setAreaPixels(px), []);

  const validate = async () => {
    if (!areaPixels) return;
    setProcessing(true);
    try {
      const blob = await getCroppedBlob(src, areaPixels, rotation);
      onConfirm(blob);
    } catch {
      setProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2300] flex items-end justify-center p-0 sm:items-center sm:p-4"
      data-testid="crop-modal"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-2xl border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.4)] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <h2 className="font-head text-base font-semibold tracking-tight text-[#14161C]">Cadrer la photo</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fermer"
            data-testid="crop-cancel-btn"
            className="rounded-full bg-black/5 p-2 hover:bg-black/10 transition-[background-color]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative h-72 w-full bg-[#0B0C10] sm:h-80" data-testid="crop-area">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={4 / 3}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            restrictPosition={false}
            showGrid
          />
        </div>

        <div className="space-y-3 p-5">
          <div className="flex items-center gap-3">
            <ZoomIn className="h-4 w-4 shrink-0 text-gray-500" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              data-testid="crop-zoom-range"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-black/10 accent-[#14161C]"
            />
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              data-testid="crop-rotate-btn"
              title="Pivoter"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-gray-600 hover:bg-black/10 transition-[background-color]"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={validate}
              disabled={processing}
              data-testid="crop-confirm-btn"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#14161C] py-3 text-sm font-semibold text-white hover:bg-[#2a2d36] disabled:opacity-60 transition-[background-color]"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Valider le cadrage
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-gray-600 hover:bg-black/5 transition-[background-color]"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
