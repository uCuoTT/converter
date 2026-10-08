import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, FileText, GripVertical } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { QueueItem } from "@/hooks/useConverter";

interface Props {
  pages: QueueItem[];
  merge: boolean;
  locked: boolean;
  onToggleMerge: (v: boolean) => void;
  onReorder: (ids: string[]) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}

interface DragState {
  from: number;
  startY: number;
  dy: number;
  pitch: number; // row height + gap
}

const GAP = 8;

/** Drag-to-reorder via pointer capture on the grip handle (touch + mouse), rows shift live. */
export default function PdfPageOrder({ pages, merge, locked, onToggleMerge, onReorder, onMove }: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const n = pages.length;
  const to = drag ? Math.max(0, Math.min(n - 1, drag.from + Math.round(drag.dy / drag.pitch))) : -1;

  const onDown = (i: number) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (locked) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const h = rowRefs.current[i]?.getBoundingClientRect().height ?? 56;
    setDrag({ from: i, startY: e.clientY, dy: 0, pitch: h + GAP });
  };
  const onMoveDrag = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!drag) return;
    setDrag({ ...drag, dy: e.clientY - drag.startY });
  };
  const onUp = () => {
    if (!drag) return;
    if (to !== drag.from) {
      const ids = pages.map((p) => p.id);
      const [moved] = ids.splice(drag.from, 1);
      ids.splice(to, 0, moved);
      onReorder(ids);
    }
    setDrag(null);
  };

  const offsetFor = (i: number) => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < to && i > drag.from && i <= to) return -drag.pitch;
    if (drag.from > to && i >= to && i < drag.from) return drag.pitch;
    return 0;
  };

  return (
    <section className="mb-3 rounded-2xl border border-cyan-800/50 bg-cyan-950/30 p-4" data-testid="merge-pdf-panel">
      <label data-testid="merge-pdf-toggle" className="flex cursor-pointer items-center gap-3">
        <Checkbox
          data-testid="merge-pdf-checkbox"
          checked={merge}
          disabled={locked}
          onCheckedChange={(v) => onToggleMerge(v === true)}
          className="size-6"
        />
        <span className="flex-1">
          <span className="block text-sm font-semibold text-cyan-100">Unisci in PDF multipagina A4</span>
          <span className="block text-xs text-cyan-300/80">{n} immagini → un unico documento</span>
        </span>
        <FileText className="size-5 text-cyan-300" />
      </label>

      {merge ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-300/80">
            Ordine pagine · trascina o usa le frecce
          </p>
          <ul className="flex flex-col" style={{ gap: GAP }} data-testid="pdf-page-order-list">
            {pages.map((p, i) => {
              const dragging = drag?.from === i;
              return (
                <li
                  key={p.id}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  data-testid={`pdf-page-${i}`}
                  style={{ transform: `translateY(${offsetFor(i)}px) scale(${dragging ? 1.03 : 1})` }}
                  className={`relative flex items-center gap-2.5 rounded-xl border bg-[#0F172A] p-2 ${
                    dragging
                      ? "z-10 border-cyan-500/70 shadow-[0_16px_32px_-8px_rgba(6,182,212,0.35)]"
                      : "border-slate-800 transition-transform duration-200 ease-out"
                  }`}
                >
                  <span
                    data-testid={`pdf-page-drag-handle-${i}`}
                    onPointerDown={onDown(i)}
                    onPointerMove={onMoveDrag}
                    onPointerUp={onUp}
                    onPointerCancel={() => setDrag(null)}
                    aria-label="Trascina per riordinare"
                    className={`flex size-10 shrink-0 touch-none select-none items-center justify-center rounded-lg ${
                      dragging ? "cursor-grabbing text-cyan-300" : "cursor-grab text-slate-500"
                    }`}
                  >
                    <GripVertical className="size-5" />
                  </span>
                  <span className="font-mono text-xs font-bold text-cyan-300">{String(i + 1).padStart(2, "0")}</span>
                  {p.thumb ? (
                    <img src={p.thumb} alt="" draggable={false} className="size-11 shrink-0 rounded-lg object-cover" />
                  ) : null}
                  <span data-testid={`pdf-page-name-${i}`} className="min-w-0 flex-1 truncate text-sm text-slate-200">
                    {p.file.name}
                  </span>
                  <button
                    type="button"
                    data-testid={`pdf-page-up-btn-${i}`}
                    disabled={locked || i === 0}
                    onClick={() => onMove(p.id, -1)}
                    aria-label="Sposta su"
                    className="flex size-9 items-center justify-center rounded-lg text-slate-300 transition-colors duration-150 hover:bg-slate-800 disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    data-testid={`pdf-page-down-btn-${i}`}
                    disabled={locked || i === n - 1}
                    onClick={() => onMove(p.id, 1)}
                    aria-label="Sposta giù"
                    className="flex size-9 items-center justify-center rounded-lg text-slate-300 transition-colors duration-150 hover:bg-slate-800 disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
