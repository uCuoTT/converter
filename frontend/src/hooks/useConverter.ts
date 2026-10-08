import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ALLOWED,
  defaultTarget,
  detectKind,
  formatBytes,
  outputName,
  type MediaKind,
  type TargetFormat,
} from "@/lib/formats";
import { cancelFFmpeg, convertMedia } from "@/lib/ffmpeg";
import { cancelImageJobs, runImageJob } from "@/lib/imageClient";
import type { ImageTarget } from "@/lib/imageConvert";
import { saveAllToDevice, type ConvertResult } from "@/lib/save";

export type ItemStatus = "idle" | "converting" | "done" | "error";

export interface QueueItem {
  id: string;
  file: File;
  kind: MediaKind;
  target: TargetFormat | null;
  status: ItemStatus;
  progress: number;
  stage: string;
  result: ConvertResult | null;
  error: string | null;
  merged: boolean;
}

const LARGE_FILE = 400 * 1024 * 1024;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useConverter() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [mergePdf, setMergePdf] = useState(true);
  const [running, setRunning] = useState(false);
  const [overall, setOverall] = useState(0);
  const [merged, setMerged] = useState<ConvertResult | null>(null);
  const cancelRef = useRef(false);

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
        status: "idle",
        progress: 0,
        stage: "",
        result: null,
        error: null,
        merged: false,
      });
    }
    if (next.length) setItems((prev) => [...prev, ...next]);
  }, []);

  const resetItem = (i: QueueItem): QueueItem => {
    if (i.result) URL.revokeObjectURL(i.result.url);
    return { ...i, status: "idle", progress: 0, stage: "", result: null, error: null, merged: false };
  };

  const setTarget = useCallback((id: string, target: TargetFormat) => {
    setItems((prev) => prev.map((i) => (i.id === id && i.status !== "converting" ? { ...resetItem(i), target } : i)));
  }, []);

  const applyToAll = useCallback((target: TargetFormat) => {
    setItems((prev) =>
      prev.map((i) =>
        ALLOWED[i.kind].includes(target) && i.status !== "converting" && i.target !== target
          ? { ...resetItem(i), target }
          : i,
      ),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const it = prev.find((i) => i.id === id);
      if (it?.result) URL.revokeObjectURL(it.result.url);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems((prev) => {
      prev.forEach((i) => i.result && URL.revokeObjectURL(i.result.url));
      return [];
    });
    setMerged((m) => {
      if (m) URL.revokeObjectURL(m.url);
      return null;
    });
    setOverall(0);
  }, []);

  const convertAll = useCallback(async () => {
    const pendingItems = items.filter((i) => i.target && (i.status === "idle" || i.status === "error"));
    if (!pendingItems.length) return;
    const pdfImages = pendingItems.filter((i) => i.kind === "image" && i.target === "pdf");
    const group = mergePdf && pdfImages.length >= 2 ? pdfImages : [];
    const singles = pendingItems.filter((i) => !group.includes(i));
    const total = singles.length + (group.length ? 1 : 0);
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
          if (it.kind === "image") {
            patch([it.id], { stage: target === "pdf" ? "Impaginazione PDF…" : "Elaborazione immagine…" });
            blob = await runImageJob(
              target === "pdf"
                ? { type: "pdf", files: [it.file] }
                : { type: "convert", file: it.file, format: target as ImageTarget },
              onP,
            );
          } else {
            blob = await convertMedia(it.file, target, onP, (stage) => patch([it.id], { stage }));
          }
          const result = { blob, name: outputName(it.file.name, target), url: URL.createObjectURL(blob) };
          patch([it.id], { status: "done", progress: 1, stage: "Completato", result });
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
        patch(ids, { status: "converting", progress: 0, stage: "Unione in PDF A4…", error: null });
        try {
          const blob = await runImageJob({ type: "pdf", files: group.map((g) => g.file) }, (p) => {
            patch(ids, { progress: p });
            tick(p);
          });
          const name = `ConvertiTutto_${group.length}_pagine.pdf`;
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
  }, [items, mergePdf, patch]);

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
  const pdfImageCount = items.filter((i) => i.kind === "image" && i.target === "pdf" && i.status !== "done").length;

  return {
    items,
    mergePdf,
    setMergePdf,
    running,
    overall,
    merged,
    results,
    pendingCount,
    pdfImageCount,
    addFiles,
    setTarget,
    applyToAll,
    remove,
    clearAll,
    convertAll,
    cancel,
    saveAll,
  };
}
