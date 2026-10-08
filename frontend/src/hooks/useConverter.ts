import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CANVAS_TARGETS,
  allowedTargets,
  defaultTarget,
  detectKind,
  formatBytes,
  defaultBaseName,
  finalName,
  type MediaKind,
  type TargetFormat,
} from "@/lib/formats";
import { cancelFFmpeg, convertMedia, type VideoPreset } from "@/lib/ffmpeg";
import { cancelImageJobs, runImageJob } from "@/lib/imageClient";
import type { ImageOptions, ImageTarget } from "@/lib/imageConvert";
import { saveAllToDevice, type ConvertResult } from "@/lib/save";

export type ItemStatus = "idle" | "converting" | "done" | "error";

export interface QueueItem {
  id: string;
  file: File;
  kind: MediaKind;
  target: TargetFormat | null;
  preset: VideoPreset;
  thumb: string | null; // object URL preview for images
  status: ItemStatus;
  progress: number;
  stage: string;
  result: ConvertResult | null;
  error: string | null;
  merged: boolean;
  outName: string; // user-typed output name (no extension); "" = default name
}

const suffixFor = (i: Pick<QueueItem, "preset" | "target">) =>
  i.preset === "whatsapp" && i.target === "mp4" ? "whatsapp" : "convertito";

/** Default output name (no extension) shown as placeholder. */
export const defaultNameFor = (i: QueueItem) => defaultBaseName(i.file.name, suffixFor(i));

const nameFor = (i: QueueItem) => finalName(i.outName, defaultNameFor(i), i.target as TargetFormat);

export const DEFAULT_IMAGE_OPTIONS: ImageOptions = { quality: 0.92, maxSide: null };

const LARGE_FILE = 400 * 1024 * 1024;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const isPdfCandidate = (i: QueueItem) => i.kind === "image" && i.target === "pdf";

const resetItem = (i: QueueItem): QueueItem => {
  if (i.result) URL.revokeObjectURL(i.result.url);
  return { ...i, status: "idle", progress: 0, stage: "", result: null, error: null, merged: false };
};

const disposeItem = (i: QueueItem) => {
  if (i.result) URL.revokeObjectURL(i.result.url);
  if (i.thumb) URL.revokeObjectURL(i.thumb);
};

export function useConverter() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [mergePdf, setMergePdf] = useState(true);
  const [imageOptions, setImageOptionsState] = useState<ImageOptions>(DEFAULT_IMAGE_OPTIONS);
  const [running, setRunning] = useState(false);
  const [overall, setOverall] = useState(0);
  const [merged, setMerged] = useState<ConvertResult | null>(null);
  const cancelRef = useRef(false);
  const [pdfName, setPdfNameState] = useState("");
  const mergedDefaultRef = useRef("ConvertiTutto");

  /** Rename an output: no re-conversion needed, an existing result just gets the new name. */
  const setOutName = useCallback((id: string, text: string) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const next = { ...i, outName: text };
        return next.result ? { ...next, result: { ...next.result, name: nameFor(next) } } : next;
      }),
    );
  }, []);

  const setPdfName = useCallback((text: string) => {
    setPdfNameState(text);
    setMerged((m) => (m ? { ...m, name: finalName(text, mergedDefaultRef.current, "pdf") } : m));
  }, []);

  const clearMerged = useCallback(() => {
    setMerged((m) => {
      if (m) URL.revokeObjectURL(m.url);
      return null;
    });
  }, []);

  const patch = useCallback((ids: string[], p: Partial<QueueItem>) => {
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, ...p } : i)));
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const next: QueueItem[] = [];
    for (const file of files) {
      const kind = detectKind(file);
      if (kind === "unknown") {
        toast.error(`Formato non supportato: ${file.name}`);
        continue;
      }
      if (file.size > LARGE_FILE) {
        toast.warning(`${file.name} pesa ${formatBytes(file.size)}: la conversione potrebbe esaurire la memoria del telefono`);
      }
      next.push({
        id: uid(),
        file,
        kind,
        target: defaultTarget(kind, file),
        preset: "standard",
        thumb: kind === "image" ? URL.createObjectURL(file) : null,
        status: "idle",
        progress: 0,
        stage: "",
        result: null,
        error: null,
        merged: false,
        outName: "",
      });
    }
    if (next.length) setItems((prev) => [...prev, ...next]);
  }, []);

  const setTarget = useCallback((id: string, target: TargetFormat, preset: VideoPreset = "standard") => {
    setItems((prev) =>
      prev.map((i) => (i.id === id && i.status !== "converting" ? { ...resetItem(i), target, preset } : i)),
    );
  }, []);

  /** One-tap toggle of the WhatsApp compression preset on a video item. */
  const toggleWhatsapp = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id || i.kind !== "video" || i.status === "converting") return i;
        const on = !(i.preset === "whatsapp" && i.target === "mp4");
        return { ...resetItem(i), target: "mp4", preset: on ? "whatsapp" : "standard" };
      }),
    );
  }, []);

  const applyToAll = useCallback((target: TargetFormat, preset: VideoPreset = "standard") => {
    setItems((prev) =>
      prev.map((i) => {
        if (!allowedTargets(i.kind, i.file).includes(target) || i.status === "converting") return i;
        const p: VideoPreset = i.kind === "video" ? preset : "standard";
        return i.target === target && i.preset === p ? i : { ...resetItem(i), target, preset: p };
      }),
    );
  }, []);

  /** New photo settings -> already converted photos go back to the queue to be re-converted. */
  const setImageOptions = useCallback(
    (opts: ImageOptions) => {
      setImageOptionsState(opts);
      setItems((prev) => prev.map((i) => (i.kind === "image" && i.status === "done" ? resetItem(i) : i)));
      clearMerged();
    },
    [clearMerged],
  );

  /** Reorders the PDF pages (image items targeting PDF), keeping every other item in place. */
  const reorderPdf = useCallback(
    (ids: string[]) => {
      const current = items.filter(isPdfCandidate).map((i) => i.id);
      if (ids.length !== current.length || ids.every((id, k) => id === current[k])) return;
      setItems((prev) => {
        const byId = new Map(prev.map((i) => [i.id, i]));
        const ordered = ids.map((id) => byId.get(id)).filter((i): i is QueueItem => !!i);
        if (ordered.length !== prev.filter(isPdfCandidate).length) return prev;
        let k = 0;
        return prev.map((i) => {
          if (!isPdfCandidate(i)) return i;
          const next = ordered[k++];
          return next.merged ? resetItem(next) : next;
        });
      });
      clearMerged();
    },
    [items, clearMerged],
  );

  const movePdfPage = useCallback(
    (id: string, dir: -1 | 1) => {
      const ids = items.filter(isPdfCandidate).map((i) => i.id);
      const from = ids.indexOf(id);
      const to = from + dir;
      if (from < 0 || to < 0 || to >= ids.length) return;
      [ids[from], ids[to]] = [ids[to], ids[from]];
      reorderPdf(ids);
    },
    [items, reorderPdf],
  );

  const remove = useCallback(
    (id: string) => {
      setItems((prev) => {
        const it = prev.find((i) => i.id === id);
        if (it) disposeItem(it);
        return prev.filter((i) => i.id !== id);
      });
      if (items.find((i) => i.id === id)?.merged) clearMerged();
    },
    [items, clearMerged],
  );

  const clearAll = useCallback(() => {
    setItems((prev) => {
      prev.forEach(disposeItem);
      return [];
    });
    clearMerged();
    setOverall(0);
  }, [clearMerged]);

  const convertAll = useCallback(async () => {
    const pendingItems = items.filter((i) => i.target && (i.status === "idle" || i.status === "error"));
    if (!pendingItems.length) return;
    const candidates = items.filter(isPdfCandidate);
    // merging: any pending page re-builds the whole PDF in the user's page order
    const group = mergePdf && candidates.length >= 2 && pendingItems.some(isPdfCandidate) ? candidates : [];
    const singles = pendingItems.filter((i) => !group.includes(i));
    const total = singles.length + (group.length ? 1 : 0);
    const options = imageOptions;
    let done = 0;
    let failed = 0;
    const tick = (p: number) => setOverall((done + p) / total);

    cancelRef.current = false;
    setRunning(true);
    setOverall(0);
    try {
      for (const it of singles) {
        if (cancelRef.current) break;
        const target = it.target as TargetFormat;
        patch([it.id], { status: "converting", progress: 0, stage: "Preparazione…", error: null });
        const onP = (p: number) => {
          patch([it.id], { progress: p });
          tick(p);
        };
        try {
          let blob: Blob;
          if (it.kind === "image" && CANVAS_TARGETS.includes(target)) {
            patch([it.id], { stage: target === "pdf" ? "Impaginazione PDF…" : "Elaborazione immagine…" });
            blob = await runImageJob(
              target === "pdf"
                ? { type: "pdf", files: [it.file], options }
                : { type: "convert", file: it.file, format: target as ImageTarget, options },
              onP,
            );
          } else {
            blob = await convertMedia(it.file, target, onP, (stage) => patch([it.id], { stage }), {
              preset: it.preset,
              maxSide: options.maxSide,
              fromImage: it.kind === "image",
            });
          }
          const name = nameFor(it);
          patch([it.id], { status: "done", progress: 1, stage: "Completato", result: { blob, name, url: URL.createObjectURL(blob) } });
        } catch (e) {
          if (cancelRef.current) {
            patch([it.id], { status: "idle", progress: 0, stage: "" });
            break;
          }
          failed++;
          patch([it.id], { status: "error", stage: "", error: errMsg(e) });
        }
        done++;
      }

      if (group.length && !cancelRef.current) {
        const ids = group.map((g) => g.id);
        patch(ids, { status: "converting", progress: 0, stage: "Unione in PDF A4…", error: null, merged: false });
        try {
          const blob = await runImageJob({ type: "pdf", files: group.map((g) => g.file), options }, (p) => {
            patch(ids, { progress: p });
            tick(p);
          });
          const name = finalName(pdfName, `ConvertiTutto_${group.length}_pagine`, "pdf");
          mergedDefaultRef.current = `ConvertiTutto_${group.length}_pagine`;
          setMerged((m) => {
            if (m) URL.revokeObjectURL(m.url);
            return { blob, name, url: URL.createObjectURL(blob) };
          });
          patch(ids, { status: "done", progress: 1, stage: "Incluso nel PDF unito", merged: true });
        } catch (e) {
          if (cancelRef.current) patch(ids, { status: "idle", progress: 0, stage: "" });
          else {
            failed++;
            patch(ids, { status: "error", stage: "", error: errMsg(e) });
          }
        }
        done++;
      }
    } finally {
      setRunning(false);
      if (cancelRef.current) toast("Conversione annullata");
      else if (failed) toast.error(`${failed} conversione/i non riuscita/e`);
      else toast.success("Conversione completata! Ora puoi salvare nel telefono.");
    }
  }, [items, mergePdf, imageOptions, patch, pdfName]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    cancelFFmpeg();
    cancelImageJobs();
  }, []);

  const results: ConvertResult[] = [
    ...(merged ? [merged] : []),
    ...items.flatMap((i) => (i.status === "done" && i.result ? [i.result] : [])),
  ];

  const saveAll = useCallback(() => saveAllToDevice(results), [results]);

  const pendingCount = items.filter((i) => i.target && (i.status === "idle" || i.status === "error")).length;
  const pdfPages = items.filter(isPdfCandidate);
  const hasImages = items.some((i) => i.kind === "image");

  return {
    items,
    mergePdf,
    setMergePdf,
    imageOptions,
    setImageOptions,
    running,
    overall,
    merged,
    results,
    pendingCount,
    pdfPages,
    hasImages,
    addFiles,
    setTarget,
    toggleWhatsapp,
    applyToAll,
    reorderPdf,
    movePdfPage,
    remove,
    clearAll,
    convertAll,
    cancel,
    saveAll,
    setOutName,
    pdfName,
    setPdfName,
  };
}
