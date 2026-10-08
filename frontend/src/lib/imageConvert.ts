import { jsPDF } from "jspdf";

/* Pure image engine — runs inside src/workers/image.worker.ts (OffscreenCanvas),
 * or on the main thread as a fallback for browsers without OffscreenCanvas. */

export type ImageTarget = "jpg" | "png" | "webp";

/** quality: 0..1 for JPG/WEBP/PDF pages (PNG is lossless). maxSide: longest side in px, null = original. */
export interface ImageOptions {
  quality: number;
  maxSide: number | null;
}

export type ImageJob =
  | { type: "convert"; file: Blob; format: ImageTarget; options: ImageOptions }
  | { type: "pdf"; files: Blob[]; options: ImageOptions };

const MIME: Record<ImageTarget, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const MAX_AREA = 16_000_000; // iOS Safari canvas limit is ~16.7MP
const PDF_MAX_SIDE = 2480; // ~300dpi on A4
const A4_MARGIN_MM = 10;

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = Pick<CanvasRenderingContext2D, "drawImage" | "fillRect" | "fillStyle" | "imageSmoothingQuality">;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function isOffscreen(c: AnyCanvas): c is OffscreenCanvas {
  return "convertToBlob" in c;
}

function ctx2d(c: AnyCanvas): Ctx {
  const ctx = (isOffscreen(c) ? c.getContext("2d") : c.getContext("2d")) as Ctx | null;
  if (!ctx) throw new Error("Canvas 2D non disponibile");
  return ctx;
}

function canvasToBlob(c: AnyCanvas, mime: string, quality?: number): Promise<Blob> {
  if (isOffscreen(c)) return c.convertToBlob({ type: mime, quality });
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Codifica immagine fallita"))), mime, quality),
  );
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new Error("Impossibile leggere l'immagine: formato non supportato dal browser");
  }
}

function fit(w: number, h: number, maxSide: number | null) {
  let s = 1;
  if (w * h > MAX_AREA) s = Math.sqrt(MAX_AREA / (w * h));
  if (maxSide) s = Math.min(s, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

async function render(bmp: ImageBitmap, format: ImageTarget, maxSide: number | null, quality: number) {
  const { w, h } = fit(bmp.width, bmp.height, maxSide);
  const canvas = makeCanvas(w, h);
  const ctx = ctx2d(canvas);
  ctx.imageSmoothingQuality = "high";
  if (format === "jpg") {
    ctx.fillStyle = "#ffffff"; // JPG has no alpha
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await canvasToBlob(canvas, MIME[format], format === "png" ? undefined : quality);
  return { blob, w, h };
}

export async function convertImage(
  file: Blob,
  format: ImageTarget,
  options: ImageOptions,
  onProgress: (p: number) => void,
): Promise<Blob> {
  onProgress(0.1);
  const bmp = await decode(file);
  onProgress(0.45);
  try {
    const { blob } = await render(bmp, format, options.maxSide, options.quality);
    if (blob.type !== MIME[format]) {
      throw new Error(`Questo browser non supporta la codifica ${format.toUpperCase()}`);
    }
    onProgress(1);
    return blob;
  } finally {
    bmp.close();
  }
}

/** One A4 page per image (in the given order), orientation follows the image, centered with margins. */
export async function imagesToPdf(files: Blob[], options: ImageOptions, onProgress: (p: number) => void): Promise<Blob> {
  const maxSide = Math.min(options.maxSide ?? PDF_MAX_SIDE, PDF_MAX_SIDE);
  let doc: jsPDF | null = null;
  for (let i = 0; i < files.length; i++) {
    const bmp = await decode(files[i]);
    try {
      const orientation = bmp.width > bmp.height ? "landscape" : "portrait";
      const { blob, w, h } = await render(bmp, "jpg", maxSide, options.quality);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (!doc) doc = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
      else doc.addPage("a4", orientation);
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const s = Math.min((pw - 2 * A4_MARGIN_MM) / w, (ph - 2 * A4_MARGIN_MM) / h);
      const dw = w * s;
      const dh = h * s;
      doc.addImage(bytes, "JPEG", (pw - dw) / 2, (ph - dh) / 2, dw, dh, undefined, "FAST");
    } finally {
      bmp.close();
    }
    onProgress((i + 1) / files.length);
  }
  if (!doc) throw new Error("Nessuna immagine da impaginare");
  return doc.output("blob");
}

export function runImageJobInline(job: ImageJob, onProgress: (p: number) => void): Promise<Blob> {
  return job.type === "pdf"
    ? imagesToPdf(job.files, job.options, onProgress)
    : convertImage(job.file, job.format, job.options, onProgress);
}
