import { useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.5;

export function ImageLightbox({ src, alt = "Image", onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function clampTranslate(x: number, y: number, s: number) {
    if (s <= 1) return { x: 0, y: 0 };
    const el = containerRef.current;
    if (!el) return { x, y };
    const maxX = (el.clientWidth  * (s - 1)) / 2;
    const maxY = (el.clientHeight * (s - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }

  function zoom(delta: number) {
    setScale((prev) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta));
      setTranslate((t) => clampTranslate(t.x, t.y, next));
      return next;
    });
  }

  function reset() {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }

  // ── Pinch-to-zoom ──────────────────────────────────────────────────────────
  const lastDist = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0]!.clientX - e.touches[1]!.clientX;
      const dy = e.touches[0]!.clientY - e.touches[1]!.clientY;
      lastDist.current = Math.hypot(dx, dy);
    } else if (e.touches.length === 1 && scale > 1) {
      dragStart.current = {
        mx: e.touches[0]!.clientX,
        my: e.touches[0]!.clientY,
        tx: translate.x,
        ty: translate.y,
      };
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 2 && lastDist.current !== null) {
      const dx = e.touches[0]!.clientX - e.touches[1]!.clientX;
      const dy = e.touches[0]!.clientY - e.touches[1]!.clientY;
      const dist = Math.hypot(dx, dy);
      const delta = (dist - lastDist.current) * 0.01;
      lastDist.current = dist;
      setScale((prev) => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta));
        setTranslate((t) => clampTranslate(t.x, t.y, next));
        return next;
      });
    } else if (e.touches.length === 1 && dragStart.current && scale > 1) {
      const dx = e.touches[0]!.clientX - dragStart.current.mx;
      const dy = e.touches[0]!.clientY - dragStart.current.my;
      setTranslate(clampTranslate(dragStart.current.tx + dx, dragStart.current.ty + dy, scale));
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) lastDist.current = null;
    if (e.touches.length === 0) dragStart.current = null;
  }

  // ── Mouse drag (desktop) ───────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, tx: translate.x, ty: translate.y };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!isDragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    setTranslate(clampTranslate(dragStart.current.tx + dx, dragStart.current.ty + dy, scale));
  }

  function onMouseUp() {
    setIsDragging(false);
    dragStart.current = null;
  }

  // ── Wheel zoom (desktop) ──────────────────────────────────────────────────
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoom(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Controls */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <ControlBtn onClick={() => zoom(ZOOM_STEP)}  title="Zoom in"  icon={<ZoomIn  size={18} />} />
        <ControlBtn onClick={() => zoom(-ZOOM_STEP)} title="Zoom out" icon={<ZoomOut size={18} />} />
        {scale !== 1 && (
          <ControlBtn onClick={reset} title="Reset" icon={<RotateCcw size={18} />} />
        )}
        <ControlBtn onClick={onClose} title="Close" icon={<X size={18} />} danger />
      </div>

      {/* Scale indicator */}
      {scale !== 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
          {Math.round(scale * 100)}%
        </div>
      )}

      {/* Image container */}
      <div
        ref={containerRef}
        className="flex h-full w-full items-center justify-center overflow-hidden"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transition: isDragging ? "none" : "transform 0.15s ease",
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            userSelect: "none",
            touchAction: "none",
          }}
        />
      </div>
    </div>
  );
}

function ControlBtn({
  onClick,
  title,
  icon,
  danger = false,
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur transition
        ${danger
          ? "bg-white/10 text-white hover:bg-red-500"
          : "bg-white/10 text-white hover:bg-white/25"
        }`}
    >
      {icon}
    </button>
  );
}
