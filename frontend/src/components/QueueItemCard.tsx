import { useSyncExternalStore } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileImage,
  FileVideo,
  MessageCircle,
  Music,
  Pencil,
  Share2,
  X,
} from "lucide-react";
import { FORMATS, extOf, formatBytes, sizeDelta } from "@/lib/formats";
import { engineStore } from "@/lib/ffmpeg";
import { canShareFiles, saveToDevice, shareResult } from "@/lib/save";
import { defaultNameFor, type QueueItem } from "@/hooks/useConverter";

interface Props {
  item: QueueItem;
  index: number;
  locked: boolean;
  onPickFormat: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleWhatsapp: (id: string) => void;
  onRename: (id: string, name: string) => void;
  /** item is a page of the merged PDF: its own name is irrelevant (the PDF has one) */
  inMergedPdf: boolean;
}

const KIND_ICON = { image: FileImage, video: FileVideo, audio: Music, unknown: FileImage };
const KIND_TINT = {
  image: "bg-cyan-500/15 text-cyan-300",
  video: "bg-blue-500/15 text-blue-300",
  audio: "bg-emerald-500/15 text-emerald-300",
  unknown: "bg-slate-700 text-slate-300",
};

export default function QueueItemCard({ item, index, locked, onPickFormat, onRemove, onToggleWhatsapp, onRename, inMergedPdf }: Props) {
  const isWa = item.preset === "whatsapp" && item.target === "mp4";
  const Icon = KIND_ICON[item.kind];
  const engine = useSyncExternalStore(engineStore.subscribe, engineStore.get, engineStore.get);
  const converting = item.status === "converting";
  const showEngineDl = converting && item.kind !== "image" && engine.phase === "downloading";
  const pct = Math.round((showEngineDl ? engine.download : item.progress) * 100);
  const sharable = canShareFiles();

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      data-testid={`queue-item-${index}`}
      className={`rounded-2xl border bg-[#131B2A] p-3.5 transition-colors duration-200 ${
        item.status === "done"
          ? "border-emerald-700/50"
          : item.status === "error"
            ? "border-red-800/60"
            : converting
              ? "border-blue-500/60"
              : "border-slate-800"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${KIND_TINT[item.kind]}`}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p data-testid={`queue-item-name-${index}`} className="truncate text-sm font-semibold text-slate-100">
            {item.file.name}
          </p>
          <p className="font-mono text-xs text-slate-400">
            {extOf(item.file.name).toUpperCase() || "?"} · {formatBytes(item.file.size)}
          </p>
        </div>
        <button
          type="button"
          data-testid={`format-sheet-trigger-${index}`}
          disabled={locked || converting}
          onClick={() => onPickFormat(item.id)}
          className="flex h-11 items-center gap-1 rounded-xl border border-slate-700 bg-[#1A2436] px-3 font-mono text-sm font-bold text-white transition-[transform,border-color] duration-150 hover:border-blue-500/60 active:scale-95 disabled:opacity-60"
          aria-label="Scegli formato di destinazione"
        >
          → {item.target ? FORMATS[item.target].label : "?"}
          {isWa ? <span className="text-[10px] text-emerald-300">WA</span> : null}
          <ChevronDown className="size-4 text-slate-400" />
        </button>
        {!converting && !locked ? (
          <button
            type="button"
            data-testid={`remove-item-btn-${index}`}
            onClick={() => onRemove(item.id)}
            aria-label="Rimuovi file"
            className="flex size-11 items-center justify-center rounded-xl text-slate-500 transition-colors duration-150 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      {!converting && !inMergedPdf && item.target ? (
        <label
          className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-slate-800 bg-[#0F172A] pl-3 pr-3 transition-colors duration-150 focus-within:border-blue-500/70"
        >
          <Pencil className="size-4 shrink-0 text-slate-500" />
          <input
            data-testid={`output-name-input-${index}`}
            value={item.outName}
            onChange={(e) => onRename(item.id, e.target.value)}
            placeholder={defaultNameFor(item)}
            disabled={locked}
            maxLength={140}
            aria-label="Nome del file convertito"
            enterKeyHint="done"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="min-w-0 flex-1 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-500 disabled:opacity-60"
          />
          <span data-testid={`output-name-ext-${index}`} className="shrink-0 font-mono text-xs font-bold text-slate-400">
            .{item.target}
          </span>
        </label>
      ) : null}

      {item.kind === "video" && !converting && item.status !== "done" ? (
        <button
          type="button"
          data-testid={`whatsapp-preset-btn-${index}`}
          disabled={locked}
          onClick={() => onToggleWhatsapp(item.id)}
          aria-pressed={isWa}
          className={`mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-[transform,border-color,background-color] duration-150 active:scale-[0.98] disabled:opacity-50 ${
            isWa
              ? "border-emerald-500/70 bg-emerald-600/20 text-emerald-200"
              : "border-slate-700 bg-[#1A2436] text-slate-200 hover:border-emerald-600/60"
          }`}
        >
          <MessageCircle className="size-4" />
          {isWa ? "WhatsApp attivo · 720p, ~1 Mbps" : "Comprimi per WhatsApp"}
        </button>
      ) : null}

      {converting ? (
        <div className="mt-3" data-testid={`item-progress-${index}`}>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="font-medium text-blue-300">{showEngineDl ? "Download motore FFmpeg (solo la prima volta)…" : item.stage}</span>
            <span className="font-mono font-bold text-white">{pct}%</span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(3, pct)}%` }}
            />
            {pct < 3 ? <span className="absolute inset-y-0 left-0 w-1/3 bg-white/15 animate-scan" /> : null}
          </div>
        </div>
      ) : null}

      {item.status === "error" ? (
        <p data-testid={`item-error-${index}`} className="mt-3 flex items-start gap-2 rounded-xl bg-red-950/50 p-2.5 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {item.error}
        </p>
      ) : null}

      {item.status === "done" ? (
        <div className="mt-3 flex items-center gap-2">
          <span data-testid={`item-done-${index}`} className="flex flex-1 items-center gap-1.5 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="size-4" />
            {item.merged ? "Incluso nel PDF unito" : `${item.result?.name} · ${formatBytes(item.result?.blob.size ?? 0)}`}
          </span>
          {item.result ? (
            <span
              data-testid={`item-size-delta-${index}`}
              className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                item.result.blob.size <= item.file.size ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {sizeDelta(item.file.size, item.result.blob.size)}
            </span>
          ) : null}
          {item.result ? (
            <>
              {sharable ? (
                <button
                  type="button"
                  data-testid={`share-item-btn-${index}`}
                  onClick={() => item.result && void shareResult(item.result).catch(() => undefined)}
                  aria-label="Condividi"
                  className="flex size-10 items-center justify-center rounded-xl bg-slate-800 text-slate-200 transition-transform duration-150 active:scale-95"
                >
                  <Share2 className="size-4" />
                </button>
              ) : null}
              <button
                type="button"
                data-testid={`save-item-btn-${index}`}
                onClick={() => item.result && saveToDevice(item.result)}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white transition-transform duration-150 active:scale-95"
              >
                <Download className="size-4" /> Salva
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </motion.li>
  );
}
