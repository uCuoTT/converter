import { Check, MessageCircle } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ALLOWED, FORMATS, GROUP_LABEL, type FormatGroup, type TargetFormat } from "@/lib/formats";
import type { VideoPreset } from "@/lib/ffmpeg";
import type { QueueItem } from "@/hooks/useConverter";

interface Props {
  item: QueueItem | null;
  onClose: () => void;
  onSelect: (id: string, t: TargetFormat, preset?: VideoPreset) => void;
  onApplyAll: (t: TargetFormat, preset?: VideoPreset) => void;
}

const GROUP_ORDER: FormatGroup[] = ["video", "audio", "image"];

export default function FormatBottomSheet({ item, onClose, onSelect, onApplyAll }: Props) {
  const allowed = item ? ALLOWED[item.kind] : [];
  const isWa = item?.preset === "whatsapp" && item.target === "mp4";

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        data-testid="format-bottom-sheet"
        className="mx-auto max-h-[85vh] max-w-md gap-0 overflow-y-auto rounded-t-[28px] border-t border-slate-700 bg-[#0F172A] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-600" />
        <SheetTitle className="font-heading text-xl font-bold">Formato Destinazione</SheetTitle>
        <SheetDescription className="mb-4 truncate text-sm text-slate-400">{item?.file.name}</SheetDescription>

        {GROUP_ORDER.map((g) => {
          const opts = allowed.filter((f) => FORMATS[f].group === g);
          if (!opts.length) return null;
          return (
            <section key={g} className="mb-5">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{GROUP_LABEL[g]}</h3>
              {g === "video" ? (
                <button
                  type="button"
                  data-testid="format-option-whatsapp"
                  onClick={() => {
                    if (item) onSelect(item.id, "mp4", "whatsapp");
                    onClose();
                  }}
                  className={`relative mb-2.5 flex min-h-[64px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-[transform,border-color,background-color] duration-150 active:scale-[0.98] ${
                    isWa ? "border-emerald-500 bg-emerald-600/20" : "border-emerald-800/60 bg-emerald-950/30 hover:border-emerald-600"
                  }`}
                >
                  <MessageCircle className="size-6 shrink-0 text-emerald-300" />
                  <span className="flex-1">
                    <span className="block font-semibold text-white">Comprimi per WhatsApp</span>
                    <span className="block text-xs text-emerald-200/80">MP4 · max 720p · 30fps · file molto più leggero</span>
                  </span>
                  {isWa ? <Check className="size-4 text-emerald-300" /> : null}
                </button>
              ) : null}
              <div className="grid grid-cols-2 gap-2.5">
                {opts.map((f) => {
                  const active = item?.target === f && !isWa;
                  return (
                    <button
                      key={f}
                      type="button"
                      data-testid={`format-option-${f}`}
                      onClick={() => {
                        if (item) onSelect(item.id, f);
                        onClose();
                      }}
                      className={`relative flex min-h-[72px] flex-col items-start justify-center rounded-2xl border px-4 py-3 text-left transition-[transform,border-color,background-color] duration-150 active:scale-[0.97] ${
                        active
                          ? "border-blue-500 bg-blue-600/20"
                          : "border-slate-700 bg-[#131B2A] hover:border-slate-500"
                      }`}
                    >
                      <span className="font-mono text-lg font-bold text-white">{FORMATS[f].label}</span>
                      <span className="text-xs leading-snug text-slate-400">{FORMATS[f].hint}</span>
                      {active ? <Check className="absolute right-3 top-3 size-4 text-blue-400" /> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {item?.target ? (
          <button
            type="button"
            data-testid="apply-format-all-btn"
            onClick={() => {
              if (item.target) onApplyAll(item.target, item.preset);
              onClose();
            }}
            className="h-12 w-full rounded-2xl border border-slate-700 text-sm font-semibold text-slate-200 transition-colors duration-150 hover:bg-slate-800"
          >
            Applica {isWa ? "WhatsApp" : FORMATS[item.target].label} a tutti i file compatibili
          </button>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
