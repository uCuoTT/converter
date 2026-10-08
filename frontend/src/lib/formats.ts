export type MediaKind = "image" | "video" | "audio" | "unknown";
export type TargetFormat = "mp4" | "webm" | "mp3" | "wav" | "aac" | "m4a" | "jpg" | "png" | "webp" | "pdf";
export type FormatGroup = "video" | "audio" | "image";

export interface FormatInfo {
  id: TargetFormat;
  label: string;
  mime: string;
  group: FormatGroup;
  hint: string;
}

export const FORMATS: Record<TargetFormat, FormatInfo> = {
  mp4: { id: "mp4", label: "MP4", mime: "video/mp4", group: "video", hint: "H.264 + AAC, compatibile ovunque" },
  webm: { id: "webm", label: "WEBM", mime: "video/webm", group: "video", hint: "VP8 + Opus, leggero per il web" },
  mp3: { id: "mp3", label: "MP3", mime: "audio/mpeg", group: "audio", hint: "Universale, 192 kbps" },
  wav: { id: "wav", label: "WAV", mime: "audio/wav", group: "audio", hint: "Senza perdita, file grandi" },
  aac: { id: "aac", label: "AAC", mime: "audio/aac", group: "audio", hint: "Compatto, alta qualità" },
  m4a: { id: "m4a", label: "M4A", mime: "audio/mp4", group: "audio", hint: "AAC per iPhone e iTunes" },
  jpg: { id: "jpg", label: "JPG", mime: "image/jpeg", group: "image", hint: "Foto, file leggeri" },
  png: { id: "png", label: "PNG", mime: "image/png", group: "image", hint: "Senza perdita, trasparenza" },
  webp: { id: "webp", label: "WEBP", mime: "image/webp", group: "image", hint: "Moderno e compatto" },
  pdf: { id: "pdf", label: "PDF", mime: "application/pdf", group: "image", hint: "Impaginato A4 automatico" },
};

export const GROUP_LABEL: Record<FormatGroup, string> = {
  video: "Video",
  audio: "Audio",
  image: "Immagini / Documenti",
};

export const ALLOWED: Record<MediaKind, TargetFormat[]> = {
  image: ["jpg", "png", "webp", "pdf"],
  video: ["mp4", "webm", "mp3", "wav", "aac", "m4a"],
  audio: ["mp3", "wav", "aac", "m4a"],
  unknown: [],
};

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif"];
const VIDEO_EXT = ["mp4", "mov", "webm", "mkv", "avi", "3gp", "m4v", "mpeg", "mpg"];
const AUDIO_EXT = ["mp3", "wav", "aac", "m4a", "ogg", "opus", "flac", "amr", "wma", "oga"];

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function detectKind(file: File): MediaKind {
  const t = file.type;
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  const ext = extOf(file.name);
  if (IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (AUDIO_EXT.includes(ext)) return "audio";
  return "unknown";
}

export function defaultTarget(kind: MediaKind, file: File): TargetFormat | null {
  const ext = extOf(file.name);
  if (kind === "image") return ext === "jpg" || ext === "jpeg" ? "png" : "jpg";
  if (kind === "video") return ext === "mp4" ? "webm" : "mp4";
  if (kind === "audio") return ext === "mp3" ? "m4a" : "mp3";
  return null;
}

export function outputName(name: string, target: TargetFormat, suffix = "convertito"): string {
  const i = name.lastIndexOf(".");
  const base = (i > 0 ? name.slice(0, i) : name) || "file";
  return `${base}_${suffix}.${target}`;
}

/** e.g. "-63%" / "+12%" — output size vs input size. */
export function sizeDelta(from: number, to: number): string {
  if (!from) return "";
  const d = Math.round(((to - from) / from) * 100);
  return `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}%`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
