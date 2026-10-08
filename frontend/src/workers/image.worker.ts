import { runImageJobInline, type ImageJob } from "@/lib/imageConvert";

const ctx = self as unknown as Worker;

ctx.onmessage = async (e: MessageEvent<{ id: number; job: ImageJob }>) => {
  const { id, job } = e.data;
  try {
    const blob = await runImageJobInline(job, (value) => ctx.postMessage({ id, type: "progress", value }));
    ctx.postMessage({ id, type: "done", blob });
  } catch (err) {
    ctx.postMessage({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
