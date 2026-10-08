import { useSyncExternalStore } from "react";
import { Cpu, Download, ShieldCheck, WifiOff, Zap } from "lucide-react";
import { engineStore, getFFmpeg, supportsMultiThread } from "@/lib/ffmpeg";
import { useInstallPrompt, useOnline } from "@/lib/pwa";

export default function HeaderStatus() {
  const online = useOnline();
  const engine = useSyncExternalStore(engineStore.subscribe, engineStore.get, engineStore.get);
  const { canInstall, install } = useInstallPrompt();
  const mt = supportsMultiThread();

  const engineLabel =
    engine.phase === "ready"
      ? engine.mode === "mt"
        ? "FFmpeg multi-thread"
        : "FFmpeg single-thread"
      : engine.phase === "downloading"
        ? `Scarico motore ${Math.round(engine.download * 100)}%`
        : engine.phase === "loading"
          ? "Avvio motore…"
          : engine.phase === "error"
            ? "Motore: errore"
            : mt
              ? "Pronto multi-thread"
              : "Modalità single-thread";

  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-40 -mx-4 mb-5 border-b border-slate-800/70 bg-[#0B0F17]/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <img src="/icons/icon-192.png" alt="" className="size-9 rounded-xl" />
          <div className="leading-tight">
            <h1 data-testid="app-title" className="font-heading text-lg font-bold tracking-tight">
              ConvertiTutto
            </h1>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">100% locale & privato</p>
          </div>
        </div>
        {canInstall ? (
          <button
            type="button"
            data-testid="install-app-btn"
            onClick={install}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white transition-transform duration-150 active:scale-95"
          >
            <Download className="size-4" /> Installa
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span
          data-testid="network-status-badge"
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            online ? "bg-[#064E3B] text-[#D1FAE5]" : "bg-amber-950 text-amber-200"
          }`}
        >
          {online ? (
            <>
              <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Nessun upload
            </>
          ) : (
            <>
              <WifiOff className="size-3.5" /> Offline – funziona lo stesso
            </>
          )}
        </span>
        <button
          type="button"
          data-testid="engine-status-badge"
          onClick={() => void getFFmpeg().catch(() => undefined)}
          disabled={engine.phase === "downloading" || engine.phase === "loading" || engine.phase === "ready"}
          title="Tocca per pre-caricare il motore (uso offline)"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#1E1B4B] px-2.5 py-1 text-xs font-semibold text-[#E0E7FF] transition-colors duration-150 enabled:hover:bg-indigo-900"
        >
          {mt ? <Zap className="size-3.5 text-amber-300" /> : <Cpu className="size-3.5" />}
          <span className="font-mono">{engineLabel}</span>
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-300">
          <ShieldCheck className="size-3.5 text-cyan-400" /> Web Workers
        </span>
      </div>
    </header>
  );
}
