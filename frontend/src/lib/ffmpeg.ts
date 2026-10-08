import { FFmpeg, FFFSType } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { FORMATS, extOf, type TargetFormat } from "@/lib/formats";

/* ffmpeg.wasm engine — runs inside @ffmpeg/ffmpeg's own Web Worker, so the UI thread stays free.
 * mt = multi-thread core (needs crossOriginIsolated + SharedArrayBuffer), st = single-thread fallback.
 * Core files are served locally from /ffmpeg/{mt|st}/ and cached by the Service Worker on first use. */

export type EngineMode = "mt" | "st";
export type EnginePhase = "idle" | "downloading" | "loading" | "ready" | "error";
export interface EngineState {
  phase: EnginePhase;
  mode: EngineMode | null;
  download: number; // 0..1 core download progress
  message: string | null;
}

let state: EngineState = { phase: "idle", mode: null, download: 0, message: null };
const listeners = new Set<() => void>();
function setEngine(patch: Partial<EngineState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const engineStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => state,
};

export const supportsMultiThread = () =>
  typeof SharedArrayBuffer !== "undefined" && globalThis.crossOriginIsolated === true;

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

/** fetch -> blob URL with progress; tolerant of compressed responses (content-length mismatch). */
async function toBlobUrl(url: string, mime: string, onProgress?: (p: number) => void): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download motore fallito (${res.status})`);
  const total = Number(res.headers.get("content-length") || 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress && total > 0) onProgress(Math.min(1, received / total));
  }
  onProgress?.(1);
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: mime }));
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function loadCore(mode: EngineMode): Promise<FFmpeg> {
  const base = `${window.location.origin}/ffmpeg/${mode}`;
  setEngine({ phase: "downloading", mode, download: 0, message: null });
  const coreURL = await toBlobUrl(`${base}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await toBlobUrl(`${base}/ffmpeg-core.wasm`, "application/wasm", (p) => setEngine({ download: p }));
  const workerURL = mode === "mt" ? await toBlobUrl(`${base}/ffmpeg-core.worker.js`, "text/javascript") : undefined;
  setEngine({ phase: "loading" });
  const ff = new FFmpeg();
  try {
    await withTimeout(ff.load({ coreURL, wasmURL, workerURL }), 90_000, "Timeout durante l'avvio del motore");
    return ff;
  } catch (err) {
    ff.terminate();
    throw err;
  }
}

export function getFFmpeg(): Promise<FFmpeg> {
  if (instance) return Promise.resolve(instance);
  if (!loading) {
    loading = (async () => {
      let ff: FFmpeg;
      if (supportsMultiThread()) {
        try {
          ff = await loadCore("mt");
        } catch (err) {
          console.warn("[ffmpeg] multi-thread non disponibile, uso single-thread", err);
          ff = await loadCore("st");
        }
      } else {
        ff = await loadCore("st");
      }
      instance = ff;
      setEngine({ phase: "ready" });
      return ff;
    })().catch((err: unknown) => {
      loading = null;
      setEngine({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      throw err;
    });
  }
  return loading;
}

/** Kills the worker (frees all wasm memory). Next conversion reloads the core from cache. */
export function cancelFFmpeg() {
  if (instance) instance.terminate();
  instance = null;
  loading = null;
  setEngine({ phase: "idle", mode: null, download: 0 });
}

const CODEC_ARGS: Record<string, string[]> = {
  // mobile-tuned: fastest presets, modest bitrates -> less RAM/CPU on phones
  mp4: ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"],
  webm: ["-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "1M", "-c:a", "libopus", "-b:a", "96k"],
  mp3: ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"],
  wav: ["-vn", "-c:a", "pcm_s16le"],
  aac: ["-vn", "-c:a", "aac", "-b:a", "192k"],
  m4a: ["-vn", "-c:a", "aac", "-b:a", "192k"],
};

export function buildArgs(input: string, output: string, target: TargetFormat): string[] {
  const codec = CODEC_ARGS[target];
  if (!codec) throw new Error(`Formato ${target} non supportato da FFmpeg`);
  return ["-i", input, ...codec, output];
}

/** Video/audio conversion. Input is mounted via WORKERFS (no copy into wasm memory) when possible. */
export async function convertMedia(
  file: File,
  target: TargetFormat,
  onProgress: (p: number) => void,
  onStage: (s: string) => void,
): Promise<Blob> {
  if (state.phase !== "ready") onStage("Avvio motore FFmpeg…");
  const ff = await getFFmpeg();
  onStage("Conversione in corso…");
  const job = Date.now().toString(36);
  const dir = `/job_${job}`;
  const outPath = `/out_${job}.${target}`;
  let inPath = "";
  let mounted = false;
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 40) logs.shift();
  };
  const onProg = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) onProgress(Math.max(0, Math.min(1, progress)));
  };
  ff.on("log", onLog);
  ff.on("progress", onProg);
  try {
    await ff.createDir(dir);
    try {
      await ff.mount(FFFSType.WORKERFS, { files: [file] }, dir);
      mounted = true;
      inPath = `${dir}/${file.name}`;
    } catch {
      inPath = `${dir}/input.${extOf(file.name) || "bin"}`;
      await ff.writeFile(inPath, await fetchFile(file));
    }
    const code = await ff.exec(buildArgs(inPath, outPath, target));
    if (code !== 0) {
      const hint = logs.filter((l) => /error|invalid|not|unsupported/i.test(l)).slice(-2).join(" · ");
      throw new Error(hint ? `FFmpeg: ${hint}` : `FFmpeg ha terminato con codice ${code}`);
    }
    const data = await ff.readFile(outPath);
    if (typeof data === "string") throw new Error("Output non valido");
    onProgress(1);
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: FORMATS[target].mime });
  } finally {
    ff.off("log", onLog);
    ff.off("progress", onProg);
    if (instance === ff) {
      // free wasm FS memory right away — phones have little RAM
      await ff.deleteFile(outPath).catch(() => undefined);
      if (mounted) await ff.unmount(dir).catch(() => undefined);
      else if (inPath) await ff.deleteFile(inPath).catch(() => undefined);
      await ff.deleteDir(dir).catch(() => undefined);
    }
  }
}
