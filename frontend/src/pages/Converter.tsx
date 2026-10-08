import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { CheckCircle2, Download, FileText, Share2, Trash2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Checkbox } from "@/components/ui/checkbox";
import HeaderStatus from "@/components/HeaderStatus";
import FilePicker from "@/components/FilePicker";
import QueueItemCard from "@/components/QueueItemCard";
import FormatBottomSheet from "@/components/FormatBottomSheet";
import BottomActionBar from "@/components/BottomActionBar";
import { useConverter } from "@/hooks/useConverter";
import { FORMATS, GROUP_LABEL, formatBytes, type FormatGroup } from "@/lib/formats";
import { canShareFiles, saveToDevice, shareResult } from "@/lib/save";
import { isIOS, isStandalone } from "@/lib/pwa";

const SUPPORTED: FormatGroup[] = ["video", "audio", "image"];

export default function Converter() {
  const c = useConverter();
  const [sheetId, setSheetId] = useState<string | null>(null);
  const sheetItem = c.items.find((i) => i.id === sheetId) ?? null;
  const hasItems = c.items.length > 0;
  const showIosHint = isIOS() && !isStandalone();

  return (
    <div className="min-h-dvh bg-[radial-gradient(120%_60%_at_100%_0%,rgba(37,99,235,0.14),transparent_60%),radial-gradient(80%_40%_at_0%_100%,rgba(6,182,212,0.08),transparent_60%)]">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-36">
        <HeaderStatus />

        {!hasItems ? (
          <section className="mb-6 animate-rise">
            <h2 className="font-heading text-[32px] font-bold leading-[1.05] tracking-tight">
              Converti tutto.
              <br />
              <span className="text-slate-400">Senza caricare niente.</span>
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-400">
              Video, audio e foto vengono elaborati direttamente sul tuo telefono con WebAssembly. Funziona anche offline.
            </p>
          </section>
        ) : (
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-heading text-xl font-bold">
              Coda <span className="font-mono text-slate-400">({c.items.length})</span>
            </h2>
            {!c.running ? (
              <button
                type="button"
                data-testid="clear-queue-btn"
                onClick={c.clearAll}
                className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-400 transition-colors duration-150 hover:bg-slate-800 hover:text-slate-100"
              >
                <Trash2 className="size-4" /> Svuota
              </button>
            ) : null}
          </div>
        )}

        {hasItems ? (
          <ul className="mb-3 flex flex-col gap-3" data-testid="conversion-queue">
            <AnimatePresence initial={false}>
              {c.items.map((item, i) => (
                <QueueItemCard
                  key={item.id}
                  item={item}
                  index={i}
                  locked={c.running}
                  onPickFormat={setSheetId}
                  onRemove={c.remove}
                />
              ))}
            </AnimatePresence>
          </ul>
        ) : null}

        {c.pdfImageCount >= 2 ? (
          <label
            data-testid="merge-pdf-toggle"
            className="mb-3 flex cursor-pointer items-center gap-3 rounded-2xl border border-cyan-800/50 bg-cyan-950/30 p-4"
          >
            <Checkbox
              data-testid="merge-pdf-checkbox"
              checked={c.mergePdf}
              disabled={c.running}
              onCheckedChange={(v) => c.setMergePdf(v === true)}
              className="size-6"
            />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-cyan-100">Unisci in PDF multipagina A4</span>
              <span className="block text-xs text-cyan-300/80">{c.pdfImageCount} immagini → un unico documento</span>
            </span>
            <FileText className="size-5 text-cyan-300" />
          </label>
        ) : null}

        {c.merged ? (
          <div data-testid="merged-pdf-result" className="mb-3 flex items-center gap-3 rounded-2xl border border-emerald-700/50 bg-emerald-950/30 p-4 animate-rise">
            <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{c.merged.name}</p>
              <p className="font-mono text-xs text-emerald-300/80">PDF A4 · {formatBytes(c.merged.blob.size)}</p>
            </div>
            {canShareFiles() ? (
              <button
                type="button"
                data-testid="share-merged-pdf-btn"
                aria-label="Condividi PDF"
                onClick={() => c.merged && void shareResult(c.merged).catch(() => undefined)}
                className="flex size-10 items-center justify-center rounded-xl bg-slate-800 transition-transform duration-150 active:scale-95"
              >
                <Share2 className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              data-testid="save-merged-pdf-btn"
              onClick={() => c.merged && saveToDevice(c.merged)}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white transition-transform duration-150 active:scale-95"
            >
              <Download className="size-4" /> Salva
            </button>
          </div>
        ) : null}

        <FilePicker onFiles={c.addFiles} compact={hasItems} disabled={c.running} />

        {!hasItems ? (
          <section className="mt-8 space-y-4" data-testid="supported-formats">
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Formati di destinazione</h3>
            {SUPPORTED.map((g, gi) => (
              <div key={g} className="animate-rise" style={{ animationDelay: `${120 + gi * 80}ms` }}>
                <p className="mb-2 text-sm font-semibold text-slate-300">{GROUP_LABEL[g]}</p>
                <div className="flex flex-wrap gap-2">
                  {Object.values(FORMATS)
                    .filter((f) => f.group === g)
                    .map((f) => (
                      <span key={f.id} className="rounded-lg border border-slate-800 bg-[#131B2A] px-3 py-1.5 font-mono text-xs font-bold text-slate-200">
                        {f.label}
                      </span>
                    ))}
                </div>
              </div>
            ))}
            {showIosHint ? (
              <p data-testid="ios-install-hint" className="rounded-2xl border border-slate-800 bg-[#131B2A] p-4 text-sm text-slate-300">
                Su iPhone: tocca <b>Condividi</b> → <b>Aggiungi alla schermata Home</b> per installare l'app.
              </p>
            ) : null}
          </section>
        ) : null}
      </main>

      <BottomActionBar
        running={c.running}
        overall={c.overall}
        pendingCount={c.pendingCount}
        resultCount={c.results.length}
        onConvert={() => void c.convertAll()}
        onCancel={c.cancel}
        onSaveAll={() => void c.saveAll()}
      />

      <FormatBottomSheet
        item={sheetItem}
        onClose={() => setSheetId(null)}
        onSelect={c.setTarget}
        onApplyAll={c.applyToAll}
      />
      <Toaster richColors theme="dark" position="bottom-center" offset={{ bottom: 116 }} mobileOffset={{ bottom: 116, left: 16, right: 16 }} />
    </div>
  );
}
