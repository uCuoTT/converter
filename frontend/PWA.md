# ConvertiTutto – Universal File Converter (PWA, zero server)

100% client-side, installable PWA. Every conversion runs on the phone (WebAssembly + Canvas). The
FastAPI backend in this repo is **not used** by the app: no API calls, no uploads.

## Setup from scratch (equivalent commands)
```bash
yarn create vite convertitutto --template react-ts && cd convertitutto
yarn add @ffmpeg/ffmpeg@0.12.15 @ffmpeg/util@0.12.2 @ffmpeg/core@0.12.10 @ffmpeg/core-mt@0.12.10 jspdf
yarn add -D tailwindcss @tailwindcss/vite
# serve the FFmpeg cores locally (offline + same-origin -> COEP-safe)
mkdir -p public/ffmpeg/st public/ffmpeg/mt
cp node_modules/@ffmpeg/core/dist/esm/*    public/ffmpeg/st/
cp node_modules/@ffmpeg/core-mt/dist/esm/* public/ffmpeg/mt/
yarn build   # -> dist/ is a pure static site
```

## Project tree
```
frontend/
  index.html                    manifest link, theme-color, iOS meta
  vite.config.ts                COOP/COEP headers (dev+preview), optimizeDeps.exclude @ffmpeg/*, worker.format=es
  public/
    manifest.webmanifest        installable PWA (standalone, portrait, icons 192/512/maskable)
    sw.js                       Service Worker: offline cache + COOP/COEP injection (coi workaround)
    _headers                    Netlify / Cloudflare Pages headers
    icons/                      app icons
    ffmpeg/st/                  single-thread core (fallback)
    ffmpeg/mt/                  multi-thread core (+ pthread worker)
  vercel.json                   Vercel headers
  src/
    main.tsx                    registers the Service Worker
    pages/Converter.tsx         single page UI
    hooks/useConverter.ts       queue state, sequential conversion, cancel, merge PDF
    lib/ffmpeg.ts               ffmpeg.wasm loader (mt -> st fallback), WORKERFS mount, args per format
    lib/imageConvert.ts         Canvas/OffscreenCanvas conversion + jsPDF A4 pagination (pure)
    workers/image.worker.ts     Web Worker running imageConvert
    lib/imageClient.ts          worker RPC + main-thread fallback
    lib/save.ts                 "Salva nel telefono" (download) + Web Share
    lib/pwa.ts                  SW registration, install prompt, online status
    components/                 HeaderStatus, FilePicker, QueueItemCard, FormatBottomSheet, BottomActionBar
```

## Cross-origin isolation (multi-thread)
`SharedArrayBuffer` requires `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`.
- Vite dev/preview: `server.headers` / `preview.headers`.
- Vercel: `vercel.json`. Netlify/Cloudflare: `public/_headers`.
- GitHub Pages (no custom headers): `public/sw.js` re-applies the headers to every same-origin response;
  `lib/pwa.ts` reloads once after first install so the page becomes isolated.
- If still not isolated (e.g. inside a cross-origin iframe, old iOS) the app falls back to the single-thread core automatically.

## Mobile memory strategy
- Input files are mounted with WORKERFS (not copied into wasm memory); output/inputs are deleted right after each job.
- Jobs run sequentially; Cancel terminates the FFmpeg worker (frees all wasm memory).
- Images capped at 16MP (iOS canvas limit); PDF pages downscaled to 2480px long side (~300dpi A4).
- Warning toast for files > 400MB.

## Android APK (Capacitor 7)
- `capacitor.config.json` (appId `com.convertitutto.app`, webDir `dist`), native project in `frontend/android/`.
- Build: `cd frontend && yarn build:apk` -> `public/download/ConvertiTutto.apk` (debug-signed, served at `/download/ConvertiTutto.apk`).
- Toolchain (git-ignored) in `/app/.android-toolchain`: Temurin JDK 21, Android SDK 35 (platform + build-tools 35.0.0),
  Gradle cache. Build host is ARM64 Linux: Google's aapt2 is x86_64-only, so build-tools binaries are replaced with the
  static aarch64 build from lzhiyong/android-sdk-tools 35.0.2 and `android.aapt2FromMavenOverride` points to it.
- In the APK: the web bundle ships in assets (offline from first launch), only the single-thread FFmpeg core is bundled
  (WebView is not cross-origin isolated), no Service Worker, `largeHeap=true`.
- "Salva nel telefono" in the APK writes via @capacitor/filesystem in 3MB chunks to `Documenti/ConvertiTutto/`
  (fallback: app folder + share sheet); Share uses @capacitor/share. `src/lib/native.ts` -> `isNative()`.
