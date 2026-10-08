import type { ImageJob } from "@/lib/imageConvert";

type WorkerMsg =
  | { id: number; type: "progress"; value: number }
  | { id: number; type: "done"; blob: Blob }
  | { id: number; type: "error"; message: string };

interface Pending {
  resolve: (b: Blob) => void;
  reject: (e: Error) => void;
  onProgress: (p: number) => void;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function rejectAll(msg: string) {
  pending.forEach((p) => p.reject(new Error(msg)));
  pending.clear();
}

function getWorker(): Worker | null {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  if (!worker) {
    worker = new Worker(new URL("../workers/image.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.type === "progress") p.onProgress(msg.value);
      else if (msg.type === "done") {
        pending.delete(msg.id);
        p.resolve(msg.blob);
      } else {
        pending.delete(msg.id);
        p.reject(new Error(msg.message));
      }
    };
    worker.onerror = () => {
      rejectAll("Errore nel worker immagini");
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

/** Runs image/PDF jobs off the main thread (Web Worker + OffscreenCanvas), main-thread fallback otherwise. */
export async function runImageJob(job: ImageJob, onProgress: (p: number) => void): Promise<Blob> {
  const w = getWorker();
  if (!w) {
    const { runImageJobInline } = await import("@/lib/imageConvert");
    return runImageJobInline(job, onProgress);
  }
  return new Promise<Blob>((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ id, job });
  });
}

export function cancelImageJobs() {
  worker?.terminate();
  worker = null;
  rejectAll("Annullato");
}
