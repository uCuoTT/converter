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

/** scale filter: longest side ≤ max, never upscale, both sides even (required by yuv420p encoders). */
export const fitScale = (max: number) =>
  `scale='if(gt(iw,ih),trunc(min(${max},iw)/2)*2,-2)':'if(gt(iw,ih),-2,trunc(min(${max},ih)/2)*2)'`;
const EVEN = "scale=trunc(iw/2)*2:trunc(ih/2)*2";
const NO_SUBS = ["-sn", "-dn"]; // subtitle/data streams often can't be remuxed -> drop them
// mobile-tuned: fastest presets, modest bitrates -> less RAM/CPU on phones
const H264 = ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p"];
const AAC128 = ["-c:a", "aac", "-b:a", "128k"];
const GIF_PALETTE = "split[a][b];[a]palettegen[p];[b][p]paletteuse";

const CODEC_ARGS: Partial<Record<TargetFormat, string[]>> = {
  // video
  mp4: [...NO_SUBS, "-vf", EVEN, ...H264, ...AAC128, "-movflags", "+faststart"],
  mov: [...NO_SUBS, "-vf", EVEN, ...H264, ...AAC128, "-movflags", "+faststart"],
  mkv: [...NO_SUBS, "-vf", EVEN, ...H264, ...AAC128],
  flv: [...NO_SUBS, "-vf", EVEN, ...H264, ...AAC128, "-ar", "44100"],
  webm: [...NO_SUBS, "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "1M", "-pix_fmt", "yuv420p", "-c:a", "libopus", "-b:a", "96k"],
  avi: [...NO_SUBS, "-vf", EVEN, "-c:v", "mpeg4", "-q:v", "5", "-c:a", "libmp3lame", "-b:a", "160k"],
  "3gp": [...NO_SUBS, "-vf", fitScale(640), "-c:v", "libx264", "-profile:v", "baseline", "-preset", "ultrafast", "-crf", "30",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-ar", "22050"],
  wmv: [...NO_SUBS, "-vf", EVEN, "-c:v", "wmv2", "-b:v", "2M", "-c:a", "wmav2", "-b:a", "160k"],
  mpeg: [...NO_SUBS, "-vf", EVEN, "-r", "30", "-c:v", "mpeg2video", "-q:v", "4", "-c:a", "mp2", "-b:a", "192k"],
  // audio (from audio or extracted from video)
  mp3: ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"],
  wav: ["-vn", "-c:a", "pcm_s16le"],
  aac: ["-vn", "-c:a", "aac", "-b:a", "192k"],
  m4a: ["-vn", "-c:a", "aac", "-b:a", "192k"],
  ogg: ["-vn", "-c:a", "libvorbis", "-q:a", "5"],
  opus: ["-vn", "-c:a", "libopus", "-b:a", "128k"],
  flac: ["-vn", "-c:a", "flac"],
  aiff: ["-vn", "-c:a", "pcm_s16be"],
  wma: ["-vn", "-c:a", "wmav2", "-b:a", "192k"],
  ac3: ["-vn", "-c:a", "ac3", "-b:a", "384k"],
  m4r: ["-vn", "-t", "40", "-c:a", "aac", "-b:a", "192k", "-f", "ipod"],
  // still frame from a video: most representative frame among the first ones
  jpg: ["-an", "-vf", "thumbnail=60", "-frames:v", "1", "-q:v", "2"],
  png: ["-an", "-vf", "thumbnail=60", "-frames:v", "1"],
};

export type VideoPreset = "standard" | "whatsapp";

export interface MediaOptions {
  preset?: VideoPreset;
  /** longest side for image -> GIF (photo settings), null = original */
  maxSide?: number | null;
  /** source is a still/animated image (GIF input) rather than a video */
  fromImage?: boolean;
}

/** "Comprimi per WhatsApp": long side ≤ 1280 (720p), ≤ 30fps, capped bitrate, AAC 96k stereo. */
const WHATSAPP_ARGS = [
  ...NO_SUBS,
  "-vf", fitScale(1280),
  "-fpsmax", "30",
  "-c:v", "libx264", "-preset", "superfast", "-crf", "30", "-maxrate", "1200k", "-bufsize", "2400k",
  "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart",
];

export function buildArgs(input: string, output: string, target: TargetFormat, opts: MediaOptions = {}): string[] {
  let codec: string[] | undefined;
  if (target === "gif") {
    codec = opts.fromImage
      ? ["-vf", `${fitScale(opts.maxSide ?? 4096)}:flags=lanczos,${GIF_PALETTE}`, "-loop", "0"]
      : ["-t", "15", "-an", "-vf", `fps=12,${fitScale(480)}:flags=lanczos,${GIF_PALETTE}`, "-loop", "0"];
  } else if (opts.preset === "whatsapp" && target === "mp4") {
    codec = WHATSAPP_ARGS;
  } else {
    codec = CODEC_ARGS[target];
  }
  if (!codec) throw new Error(`Formato ${target} non supportato da FFmpeg`);
  return ["-i", input, ...codec, output];
}

/** Video/audio conversion. Input is mounted via WORKERFS (no copy into wasm memory) when possible. */
export async function convertMedia(
  file: File,
  target: TargetFormat,
  onProgress: (p: number) => void,
  onStage: (s: string) => void,
  opts: MediaOptions = {},
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
    let code: number;
    try {
      code = await ff.exec(buildArgs(inPath, outPath, target, opts));
    } catch (err) {
      // wasm abort / RuntimeError: this engine instance is dead and would hang every next job.
      // Drop it (frees all its memory); the next conversion loads a fresh one from cache.
      if (instance === ff) cancelFFmpeg();
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        /terminate/i.test(msg) ? msg : `Il motore FFmpeg si è interrotto con ${FORMATS[target].label}: prova un altro formato`,
      );
    }
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
