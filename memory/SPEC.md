# ConvertiTutto – SPEC

Mobile-first PWA (Italian UI) converting files 100% on-device. NO backend usage, no auth, no DB.
Single route `/` (catch-all `*`) -> `src/pages/Converter.tsx`. See `frontend/PWA.md` for architecture.

## Flows
1. "Seleziona File" (`file-input`, all media) or "Apri Galleria" (`gallery-input`, image/video) -> queue (multi-file).
2. Each queue item has a format chip -> bottom sheet (`format-bottom-sheet`) with formats allowed for its kind:
   - video -> MP4, WEBM, MKV, MOV, AVI, FLV, 3GP, WMV, MPEG + audio extraction (all audio formats) + GIF (max 15s, 12fps, 480px) + frame JPG/PNG
   - audio -> MP3, WAV, AAC, M4A, OGG, OPUS, FLAC, AIFF, WMA, AC3, M4R (iPhone ringtone, first 40s)
   - image -> JPG, PNG, WEBP, GIF, BMP, TIFF, ICO (256px), PDF ; animated GIF input also -> MP4, WEBM
   - Engines: Canvas/JS worker for JPG/PNG/WEBP/BMP/TIFF/ICO/PDF (`CANVAS_TARGETS`), FFmpeg for everything else.
   - OGV intentionally NOT offered: libtheora in @ffmpeg/core 0.12.10 crashes the wasm (function signature mismatch).
   - If FFmpeg crashes (wasm abort) the instance is discarded so following jobs reload a fresh engine instead of hanging.
   - "Applica a tutti i file compatibili" applies the format to every compatible item.
3. >=2 images targeting PDF -> "Unisci in PDF multipagina A4" checkbox (default ON) -> one merged PDF (`merged-pdf-result`).
4. "Converti Ora (n)" -> sequential conversion with per-item + overall progress; cancel button stops (terminates workers).
5. Done -> per-item "Salva" / Share, bottom "Salva nel telefono (n)" downloads all results.
6. PDF page order (`pdf-page-order-list`): drag grip handle (`pdf-page-drag-handle-{i}`, pointer capture) or up/down arrows.
   Reorders the image items in the queue; an already merged PDF is discarded and rebuilt on next "Converti Ora".
7. "Comprimi per WhatsApp" (`whatsapp-preset-btn-{i}` on video cards, or `format-option-whatsapp` in sheet):
   MP4 H.264, long side ≤1280 (720p), ≤30fps, crf 30 / maxrate 1.2M, AAC 96k stereo; output `<name>_whatsapp.mp4`.
8. "Impostazioni foto" (`image-settings-panel`, shown when queue has images): quality chips 92/80/65/45
   (`image-quality-{n}`) + max long side Originale/2560/1920/1280/1024/800 (`image-maxsize-{px|original}`).
   Applies to JPG/WEBP/PDF pages (PNG lossless; PDF pages capped at 2480px). Changing settings resets done photos.
   Done items show size delta badge (`item-size-delta-{i}`).

## Engines
- Audio/video: ffmpeg.wasm 0.12 (core files in `public/ffmpeg/{mt,st}`), multi-thread when crossOriginIsolated else single-thread.
  First use downloads ~32MB core (cached by SW `ct-ffmpeg-0.12.10`).
- Images/PDF: OffscreenCanvas in `workers/image.worker.ts` + jsPDF (A4, 10mm margins, orientation per image).

## Test fixtures
`/app/tests/fixtures/media/foto1.png`, `foto2.png`, `tono.wav` (2s sine).

## Android APK
Capacitor 7 wrapper (`frontend/android`, `capacitor.config.json`). `yarn build:apk` -> `/download/ConvertiTutto.apk`
(debug-signed, ~17MB, single-thread FFmpeg bundled). Web shows `download-apk-link` (hidden when `isNative()`).
Native save -> Documents/ConvertiTutto via @capacitor/filesystem; share via @capacitor/share. No SW in native.
Toolchain at /app/.android-toolchain (ARM64 host, aapt2 override in android/gradle.properties). See frontend/PWA.md.
Pending (user deferred): Gemini integration.

Header shows only logo + 'ConvertiTutto' (+ Installa button when the browser offers PWA install).
