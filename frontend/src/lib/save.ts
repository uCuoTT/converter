export interface ConvertResult {
  blob: Blob;
  name: string;
  url: string;
}

/** Standard browser download — saves the file locally on the phone. */
export function saveToDevice(r: ConvertResult) {
  const a = document.createElement("a");
  a.href = r.url;
  a.download = r.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function saveAllToDevice(results: ConvertResult[]) {
  for (const r of results) {
    saveToDevice(r);
    await new Promise((res) => setTimeout(res, 450)); // browsers throttle burst downloads
  }
}

export function canShareFiles(): boolean {
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
  const file = new File([r.blob], r.name, { type: r.blob.type });
  await navigator.share({ files: [file], title: r.name });
}
