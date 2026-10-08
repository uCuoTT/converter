import { Loader2, Smartphone, Square, Wand2 } from "lucide-react";

interface Props {
  running: boolean;
  overall: number;
  pendingCount: number;
  resultCount: number;
  onConvert: () => void;
  onCancel: () => void;
  onSaveAll: () => void;
}

export default function BottomActionBar({ running, overall, pendingCount, resultCount, onConvert, onCancel, onSaveAll }: Props) {
  if (!running && !pendingCount && !resultCount) return null;
  const pct = Math.round(overall * 100);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800/90 bg-[#0B0F17]/95 backdrop-blur-xl">
      <div className="mx-auto max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {running ? (
          <div className="flex items-center gap-3">
            <div className="flex-1" data-testid="overall-progress">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-semibold text-blue-200">
                  <Loader2 className="size-4 animate-spin" /> Conversione sul dispositivo…
                </span>
                <span data-testid="overall-progress-value" className="font-mono font-bold">{pct}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              data-testid="cancel-conversion-btn"
              onClick={onCancel}
              aria-label="Annulla conversione"
              className="flex size-14 items-center justify-center rounded-2xl bg-red-600/90 text-white transition-transform duration-150 active:scale-95"
            >
              <Square className="size-5 fill-current" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2.5">
            {pendingCount > 0 ? (
              <button
                type="button"
                data-testid="convert-now-btn"
                onClick={onConvert}
                className="flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 font-heading text-lg font-bold text-white shadow-[0_0_24px_rgba(37,99,235,0.35)] transition-[transform,background-color] duration-150 hover:bg-blue-700 active:scale-[0.97]"
              >
                <Wand2 className="size-5" /> Converti Ora ({pendingCount})
              </button>
            ) : null}
            {resultCount > 0 ? (
              <button
                type="button"
                data-testid="save-to-phone-btn"
                onClick={onSaveAll}
                className={`flex h-16 items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-heading font-bold text-white transition-[transform,background-color] duration-150 hover:bg-emerald-700 active:scale-[0.97] ${
                  pendingCount > 0 ? "px-4 text-sm" : "flex-1 text-lg"
                }`}
              >
                <Smartphone className="size-5" />
                {pendingCount > 0 ? "Salva" : `Salva nel telefono (${resultCount})`}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
