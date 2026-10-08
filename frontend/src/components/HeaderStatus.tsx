import { Download } from "lucide-react";
import { useInstallPrompt } from "@/lib/pwa";

export default function HeaderStatus() {
  const { canInstall, install } = useInstallPrompt();

  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-40 -mx-4 mb-5 border-b border-slate-800/70 bg-[#0B0F17]/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <img src="/icons/icon-192.png" alt="" className="size-9 rounded-xl" />
          <h1 data-testid="app-title" className="font-heading text-lg font-bold tracking-tight">
            ConvertiTutto
          </h1>
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
    </header>
  );
}
