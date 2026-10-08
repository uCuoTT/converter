import { ImageDown } from "lucide-react";
import type { ImageOptions } from "@/lib/imageConvert";

interface Props {
  value: ImageOptions;
  locked: boolean;
  onChange: (v: ImageOptions) => void;
}

const QUALITIES = [
  { v: 0.92, label: "Massima" },
  { v: 0.8, label: "Alta" },
  { v: 0.65, label: "Media" },
  { v: 0.45, label: "Leggera" },
];

const SIZES: { v: number | null; label: string }[] = [
  { v: null, label: "Originale" },
  { v: 2560, label: "2560 px" },
  { v: 1920, label: "1920 px" },
  { v: 1280, label: "1280 px" },
  { v: 1024, label: "1024 px" },
  { v: 800, label: "800 px" },
];

const chip = (active: boolean) =>
  `h-11 rounded-xl border px-3 text-sm font-semibold transition-[transform,border-color,background-color] duration-150 active:scale-95 disabled:opacity-50 ${
    active ? "border-blue-500 bg-blue-600/25 text-white" : "border-slate-700 bg-[#1A2436] text-slate-300 hover:border-slate-500"
  }`;

export default function ImageSettings({ value, locked, onChange }: Props) {
  return (
    <section data-testid="image-settings-panel" className="mb-3 rounded-2xl border border-slate-800 bg-[#131B2A] p-4">
      <div className="mb-3 flex items-center gap-2">
        <ImageDown className="size-5 text-cyan-400" />
        <h3 className="font-heading text-base font-bold">Impostazioni foto</h3>
        <span data-testid="image-settings-summary" className="ml-auto font-mono text-xs text-slate-400">
          Q{Math.round(value.quality * 100)} · {value.maxSide ? `≤${value.maxSide}px` : "orig."}
        </span>
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Qualità (JPG · WEBP · PDF)</p>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {QUALITIES.map((q) => (
          <button
            key={q.v}
            type="button"
            data-testid={`image-quality-${Math.round(q.v * 100)}`}
            disabled={locked}
            onClick={() => onChange({ ...value, quality: q.v })}
            className={chip(value.quality === q.v)}
          >
            {q.label}
          </button>
        ))}
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Dimensione massima (lato lungo)</p>
      <div className="grid grid-cols-3 gap-2">
        {SIZES.map((s) => (
          <button
            key={s.label}
            type="button"
            data-testid={`image-maxsize-${s.v ?? "original"}`}
            disabled={locked}
            onClick={() => onChange({ ...value, maxSide: s.v })}
            className={`${chip(value.maxSide === s.v)} font-mono`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </section>
  );
}
