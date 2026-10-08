# ConvertiTutto – SPEC

Mobile-first PWA (Italian UI) converting files 100% on-device. NO backend usage, no auth, no DB.
Single route `/` (catch-all `*`) -> `src/pages/Converter.tsx`. See `frontend/PWA.md` for architecture.

## Flows
1. "Seleziona File" (`file-input`, all media) or "Apri Galleria" (`gallery-input`, image/video) -> queue (multi-file).
2. Each queue item has a format chip -> bottom sheet (`format-bottom-sheet`) with formats allowed for its kind:
   - image -> JPG, PNG, WEBP, PDF ; video -> MP4, WEBM, MP3, WAV, AAC, M4A ; audio -> MP3, WAV, AAC, M4A
   - "Applica a tutti i file compatibili" applies the format to every compatible item.
3. >=2 images targeting PDF -> "Unisci in PDF multipagina A4" checkbox (default ON) -> one merged PDF (`merged-pdf-result`).
4. "Converti Ora (n)" -> sequential conversion with per-item + overall progress; cancel button stops (terminates workers).
5. Done -> per-item "Salva" / Share, bottom "Salva nel telefono (n)" downloads all results.

## Engines
- Audio/video: ffmpeg.wasm 0.12 (core files in `public/ffmpeg/{mt,st}`), multi-thread when crossOriginIsolated else single-thread.
  First use downloads ~32MB core (cached by SW `ct-ffmpeg-0.12.10`).
- Images/PDF: OffscreenCanvas in `workers/image.worker.ts` + jsPDF (A4, 10mm margins, orientation per image).

## Test fixtures
`/app/tests/fixtures/media/foto1.png`, `foto2.png`, `tono.wav` (2s sine).
