import { jsPDF } from "jspdf";

/* Pure image engine — runs inside src/workers/image.worker.ts (OffscreenCanvas),
 * or on the main thread as a fallback for browsers without OffscreenCanvas. */

export type ImageTarget = "jpg" | "png" | "webp" | "bmp" | "tiff" | "ico";

/** quality: 0..1 for JPG/WEBP/PDF pages (PNG is lossless). maxSide: longest side in px, null = original. */
export interface ImageOptions {
  quality: number;
  maxSide: number | null;
}

export type ImageJob =
  | { type: "convert"; file: Blob; format: ImageTarget; options: ImageOptions }
  | { type: "pdf"; files: Blob[]; options: ImageOptions };

type CanvasTarget = "jpg" | "png" | "webp";
const MIME: Record<CanvasTarget, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const MAX_AREA = 16_000_000; // iOS Safari canvas limit is ~16.7MP
const PDF_MAX_SIDE = 2480; // ~300dpi on A4
const A4_MARGIN_MM = 10;
const ICO_SIDE = 256;

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx = Pick<
  CanvasRenderingContext2D,
  "drawImage" | "fillRect" | "fillStyle" | "imageSmoothingQuality" | "getImageData"
>;

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

async function render(bmp: ImageBitmap, format: CanvasTarget, maxSide: number | null, quality: number) {
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

/** Draws the bitmap (fitted to maxSide) and returns its RGBA pixels. */
function pixels(bmp: ImageBitmap, maxSide: number | null, background?: string) {
  const { w, h } = fit(bmp.width, bmp.height, maxSide);
  const ctx = ctx2d(makeCanvas(w, h));
  ctx.imageSmoothingQuality = "high";
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  return { w, h, data: ctx.getImageData(0, 0, w, h).data };
}

/** 24-bit BMP (bottom-up rows, 4-byte aligned, white behind transparency). */
function encodeBmp(bmp: ImageBitmap, maxSide: number | null): Blob {
  const { w, h, data } = pixels(bmp, maxSide, "#ffffff");
  const row = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + row * h;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  const out = new Uint8Array(buf);
  v.setUint16(0, 0x4d42, true); // "BM"
  v.setUint32(2, size, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, h, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, row * h, true);
  v.setInt32(38, 2835, true); // 72 dpi
  v.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    const dst = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = dst + x * 3;
      out[d] = data[s + 2];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s];
    }
  }
  return new Blob([buf], { type: "image/bmp" });
}

/** Baseline uncompressed RGBA TIFF, little-endian, single strip. */
function encodeTiff(bmp: ImageBitmap, maxSide: number | null): Blob {
  const { w, h, data } = pixels(bmp, maxSide);
  const tags: [number, number, number, number][] = [
    // [tag, type (3=SHORT, 4=LONG), count, value/offset]
    [256, 4, 1, w],
    [257, 4, 1, h],
    [258, 3, 4, 0], // BitsPerSample -> offset patched below
    [259, 3, 1, 1], // no compression
    [262, 3, 1, 2], // RGB
    [273, 4, 1, 0], // StripOffsets -> patched
    [277, 3, 1, 4], // SamplesPerPixel
    [278, 4, 1, h], // RowsPerStrip
    [279, 4, 1, w * h * 4], // StripByteCounts
    [284, 3, 1, 1], // chunky
    [338, 3, 1, 2], // ExtraSamples: unassociated alpha
  ];
  const ifdSize = 2 + tags.length * 12 + 4;
  const bpsOffset = 8 + ifdSize;
  const pixOffset = bpsOffset + 8;
  tags[2][3] = bpsOffset;
  tags[5][3] = pixOffset;
  const buf = new ArrayBuffer(pixOffset + data.length);
  const v = new DataView(buf);
  v.setUint16(0, 0x4949, true); // "II"
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true);
  v.setUint16(8, tags.length, true);
  tags.forEach(([tag, type, count, value], i) => {
    const o = 10 + i * 12;
    v.setUint16(o, tag, true);
    v.setUint16(o + 2, type, true);
    v.setUint32(o + 4, count, true);
    if (type === 3 && count === 1) v.setUint16(o + 8, value, true);
    else v.setUint32(o + 8, value, true);
  });
  v.setUint32(10 + tags.length * 12, 0, true); // no next IFD
  for (let i = 0; i < 4; i++) v.setUint16(bpsOffset + i * 2, 8, true);
  new Uint8Array(buf, pixOffset).set(data);
  return new Blob([buf], { type: "image/tiff" });
}

/** ICO with one embedded 256x256 (or smaller) PNG, image centered on a transparent square. */
async function encodeIco(bmp: ImageBitmap): Promise<Blob> {
  const side = Math.min(ICO_SIDE, Math.max(bmp.width, bmp.height));
  const { w, h } = fit(bmp.width, bmp.height, side);
  const canvas = makeCanvas(side, side);
  const ctx = ctx2d(canvas);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, Math.round((side - w) / 2), Math.round((side - h) / 2), w, h);
  const png = new Uint8Array(await (await canvasToBlob(canvas, "image/png")).arrayBuffer());
  const head = new ArrayBuffer(22);
  const v = new DataView(head);
  v.setUint16(2, 1, true); // type: icon
  v.setUint16(4, 1, true); // 1 image
  v.setUint8(6, side >= 256 ? 0 : side); // 0 means 256
  v.setUint8(7, side >= 256 ? 0 : side);
  v.setUint16(10, 1, true); // planes
  v.setUint16(12, 32, true); // bpp
  v.setUint32(14, png.length, true);
  v.setUint32(18, 22, true);
  return new Blob([head, png], { type: "image/x-icon" });
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
    let blob: Blob;
    if (format === "bmp") blob = encodeBmp(bmp, options.maxSide);
    else if (format === "tiff") blob = encodeTiff(bmp, options.maxSide);
    else if (format === "ico") blob = await encodeIco(bmp);
    else {
      blob = (await render(bmp, format, options.maxSide, options.quality)).blob;
      if (blob.type !== MIME[format]) {
        throw new Error(`Questo browser non supporta la codifica ${format.toUpperCase()}`);
      }
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
