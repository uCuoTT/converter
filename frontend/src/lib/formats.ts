export type MediaKind = "image" | "video" | "audio" | "unknown";
export type TargetFormat =
  // video
  | "mp4" | "webm" | "mkv" | "mov" | "avi" | "flv" | "3gp" | "wmv" | "mpeg"
  // audio
  | "mp3" | "wav" | "aac" | "m4a" | "ogg" | "opus" | "flac" | "aiff" | "wma" | "ac3" | "m4r"
  // image / document
  | "jpg" | "png" | "webp" | "gif" | "bmp" | "tiff" | "ico" | "pdf";
export type FormatGroup = "video" | "audio" | "image";

export interface FormatInfo {
  id: TargetFormat;
  label: string;
  mime: string;
  group: FormatGroup;
  hint: string;
}

const f = (id: TargetFormat, label: string, mime: string, group: FormatGroup, hint: string): FormatInfo => ({
  id,
  label,
  mime,
  group,
  hint,
});

export const FORMATS: Record<TargetFormat, FormatInfo> = {
  mp4: f("mp4", "MP4", "video/mp4", "video", "H.264 + AAC, compatibile ovunque"),
  webm: f("webm", "WEBM", "video/webm", "video", "VP8 + Opus, leggero per il web"),
  mkv: f("mkv", "MKV", "video/x-matroska", "video", "Matroska, H.264 + AAC"),
  mov: f("mov", "MOV", "video/quicktime", "video", "QuickTime per iPhone e Mac"),
  avi: f("avi", "AVI", "video/x-msvideo", "video", "MPEG-4 + MP3, lettori classici"),
  flv: f("flv", "FLV", "video/x-flv", "video", "Flash Video, H.264"),
  "3gp": f("3gp", "3GP", "video/3gpp", "video", "Leggerissimo, telefoni vecchi"),
  wmv: f("wmv", "WMV", "video/x-ms-wmv", "video", "Windows Media Video"),
  mpeg: f("mpeg", "MPEG", "video/mpeg", "video", "MPEG-2 per DVD e TV"),
  mp3: f("mp3", "MP3", "audio/mpeg", "audio", "Universale, 192 kbps"),
  wav: f("wav", "WAV", "audio/wav", "audio", "Senza perdita, file grandi"),
  aac: f("aac", "AAC", "audio/aac", "audio", "Compatto, alta qualità"),
  m4a: f("m4a", "M4A", "audio/mp4", "audio", "AAC per iPhone e iTunes"),
  ogg: f("ogg", "OGG", "audio/ogg", "audio", "Vorbis, open source"),
  opus: f("opus", "OPUS", "audio/opus", "audio", "Ottimo per voce e podcast"),
  flac: f("flac", "FLAC", "audio/flac", "audio", "Lossless compresso"),
  aiff: f("aiff", "AIFF", "audio/aiff", "audio", "Lossless per Apple"),
  wma: f("wma", "WMA", "audio/x-ms-wma", "audio", "Windows Media Audio"),
  ac3: f("ac3", "AC3", "audio/ac3", "audio", "Dolby Digital"),
  m4r: f("m4r", "M4R", "audio/mp4", "audio", "Suoneria iPhone (max 40s)"),
  jpg: f("jpg", "JPG", "image/jpeg", "image", "Foto, file leggeri"),
  png: f("png", "PNG", "image/png", "image", "Senza perdita, trasparenza"),
  webp: f("webp", "WEBP", "image/webp", "image", "Moderno e compatto"),
  gif: f("gif", "GIF", "image/gif", "image", "Animata, max 15s da video"),
  bmp: f("bmp", "BMP", "image/bmp", "image", "Bitmap non compressa"),
  tiff: f("tiff", "TIFF", "image/tiff", "image", "Stampa e archivio"),
  ico: f("ico", "ICO", "image/x-icon", "image", "Icona 256 px"),
  pdf: f("pdf", "PDF", "application/pdf", "image", "Impaginato A4 automatico"),
};

export const GROUP_LABEL: Record<FormatGroup, string> = {
  video: "Video",
  audio: "Audio",
  image: "Immagini / Documenti",
};

/** Section title in the format sheet, depending on the source file type. */
export function groupLabel(g: FormatGroup, kind: MediaKind): string {
  if (kind === "video" && g === "audio") return "Audio (estrai traccia)";
  if (kind === "video" && g === "image") return "Immagine · GIF e fotogramma";
  if (kind === "image" && g === "video") return "Video da GIF animata";
  return GROUP_LABEL[g];
}

const VIDEO_TARGETS: TargetFormat[] = ["mp4", "webm", "mkv", "mov", "avi", "flv", "3gp", "wmv", "mpeg"];
const AUDIO_TARGETS: TargetFormat[] = ["mp3", "wav", "aac", "m4a", "ogg", "opus", "flac", "aiff", "wma", "ac3", "m4r"];
const IMAGE_TARGETS: TargetFormat[] = ["jpg", "png", "webp", "gif", "bmp", "tiff", "ico", "pdf"];

/** Image targets encoded by Canvas/JS in the image worker; every other conversion goes through FFmpeg. */
export const CANVAS_TARGETS: TargetFormat[] = ["jpg", "png", "webp", "bmp", "tiff", "ico", "pdf"];

/** Every format listed in the "supported" overview, grouped. */
export const ALL_TARGETS: Record<FormatGroup, TargetFormat[]> = {
  video: VIDEO_TARGETS,
  audio: AUDIO_TARGETS,
  image: IMAGE_TARGETS,
};

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif", "tif", "tiff", "ico"];
const VIDEO_EXT = ["mp4", "mov", "webm", "mkv", "avi", "3gp", "m4v", "mpeg", "mpg", "flv", "wmv", "ogv", "ts", "mts"];
const AUDIO_EXT = ["mp3", "wav", "aac", "m4a", "ogg", "opus", "flac", "amr", "wma", "oga", "aiff", "aif", "ac3", "m4r"];

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

const isGif = (file: File) => file.type === "image/gif" || extOf(file.name) === "gif";

/** Formats offered for a given source file. */
export function allowedTargets(kind: MediaKind, file: File): TargetFormat[] {
  if (kind === "video") return [...VIDEO_TARGETS, ...AUDIO_TARGETS, "gif", "jpg", "png"];
  if (kind === "audio") return AUDIO_TARGETS;
  if (kind === "image") return isGif(file) ? [...IMAGE_TARGETS, "mp4", "webm"] : IMAGE_TARGETS;
  return [];
}

export function defaultTarget(kind: MediaKind, file: File): TargetFormat | null {
  const ext = extOf(file.name);
  if (kind === "image") return ext === "jpg" || ext === "jpeg" ? "png" : "jpg";
  if (kind === "video") return ext === "mp4" ? "webm" : "mp4";
  if (kind === "audio") return ext === "mp3" ? "m4a" : "mp3";
  return null;
}

export function outputName(name: string, target: TargetFormat, suffix = "convertito"): string {
  return `${defaultBaseName(name, suffix)}.${target}`;
}

/** Default output name without extension, e.g. "vacanze_convertito". */
export function defaultBaseName(name: string, suffix = "convertito"): string {
  const i = name.lastIndexOf(".");
  const base = (i > 0 ? name.slice(0, i) : name) || "file";
  return `${base}_${suffix}`;
}

const BAD_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Sanitizes a user-typed name: no forbidden chars, no leading dots, no duplicated extension, max 120 chars. */
export function cleanBaseName(input: string, target: TargetFormat): string {
  let s = input.replace(BAD_CHARS, "").replace(/\s+/g, " ").trim();
  const ext = `.${target}`;
  if (s.toLowerCase().endsWith(ext)) s = s.slice(0, -ext.length).trim();
  return s.replace(/^\.+/, "").slice(0, 120).trim();
}

/** Final file name: the user's name if valid, otherwise the default one, plus the format extension. */
export function finalName(custom: string, fallbackBase: string, target: TargetFormat): string {
  return `${cleanBaseName(custom, target) || fallbackBase}.${target}`;
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
