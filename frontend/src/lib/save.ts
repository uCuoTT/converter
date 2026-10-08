import { toast } from "sonner";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNative } from "@/lib/native";

export interface ConvertResult {
  blob: Blob;
  name: string;
  url: string;
}

const NATIVE_DIR = "ConvertiTutto";
const CHUNK = 3 * 1024 * 1024; // multiple of 3 -> base64 chunks concatenate cleanly

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.onerror = () => reject(r.error ?? new Error("Lettura file fallita"));
    r.readAsDataURL(b);
  });
}

/** Writes a Blob to native storage in 3MB base64 chunks (keeps the bridge + RAM usage low on phones). */
async function writeNative(r: ConvertResult, directory: Directory, path: string): Promise<string> {
  for (let off = 0; off < r.blob.size || off === 0; off += CHUNK) {
    const data = await blobToBase64(r.blob.slice(off, off + CHUNK));
    if (off === 0) await Filesystem.writeFile({ path, data, directory, recursive: true });
    else await Filesystem.appendFile({ path, data, directory });
    if (r.blob.size === 0) break;
  }
  const { uri } = await Filesystem.getUri({ path, directory });
  return uri;
}

async function saveNative(r: ConvertResult) {
  const path = `${NATIVE_DIR}/${r.name}`;
  try {
    const perm = await Filesystem.checkPermissions();
    if (perm.publicStorage !== "granted") await Filesystem.requestPermissions();
    await writeNative(r, Directory.Documents, path);
    toast.success(`Salvato in Documenti/${NATIVE_DIR}/${r.name}`);
  } catch {
    // public Documents not writable on this Android -> app folder + share sheet so the user can pick a place
    const uri = await writeNative(r, Directory.External, path);
    toast.success("Salvato nella cartella dell'app: scegli dove spostarlo");
    await Share.share({ title: r.name, url: uri }).catch(() => undefined);
  }
}

/** "Salva nel telefono": browser download on web/PWA, native file write in the APK. */
export async function saveToDevice(r: ConvertResult) {
  if (isNative()) {
    try {
      await saveNative(r);
    } catch (e) {
      toast.error(`Salvataggio non riuscito: ${e instanceof Error ? e.message : String(e)}`);
    }
    return;
  }
  const a = document.createElement("a");
  a.href = r.url;
  a.download = r.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function saveAllToDevice(results: ConvertResult[]) {
  // same name twice would overwrite on Android / get "(1)" suffixes in browsers -> number duplicates
  const used = new Map<string, number>();
  for (const r of results) {
    const n = used.get(r.name) ?? 0;
    used.set(r.name, n + 1);
    const dot = r.name.lastIndexOf(".");
    const name = n === 0 ? r.name : `${r.name.slice(0, dot)} (${n + 1})${r.name.slice(dot)}`;
    await saveToDevice({ ...r, name });
    if (!isNative()) await new Promise((res) => setTimeout(res, 450)); // browsers throttle burst downloads
  }
}

export function canShareFiles(): boolean {
  if (isNative()) return true;
  try {
    return (
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [new File(["x"], "t.txt", { type: "text/plain" })] })
    );
  } catch {
    return false;
  }
}

export async function shareResult(r: ConvertResult) {
  if (isNative()) {
    const uri = await writeNative(r, Directory.Cache, `share/${r.name}`);
    await Share.share({ title: r.name, url: uri });
    return;
  }
  const file = new File([r.blob], r.name, { type: r.blob.type });
  await navigator.share({ files: [file], title: r.name });
}
