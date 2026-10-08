import { useRef, useState } from "react";
import { FolderOpen, Images, Plus } from "lucide-react";

interface Props {
  onFiles: (files: File[]) => void;
  compact: boolean;
  disabled: boolean;
}

const ACCEPT_ALL = "image/*,video/*,audio/*,.heic,.heif,.mkv,.flac,.ogg,.opus,.m4a,.amr";

export default function FilePicker({ onFiles, compact, disabled }: Props) {
  const allRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handle = (list: FileList | null) => {
    if (list?.length) onFiles(Array.from(list));
  };

  const inputs = (
    <>
      <input
        ref={allRef}
        data-testid="file-input"
        type="file"
        multiple
        accept={ACCEPT_ALL}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        data-testid="gallery-input"
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );

  if (compact) {
    return (
      <div className="flex gap-2">
        {inputs}
        <button
          type="button"
          data-testid="add-more-files-btn"
          disabled={disabled}
          onClick={() => allRef.current?.click()}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-700 bg-[#131B2A] text-sm font-semibold text-slate-200 transition-[transform,border-color] duration-150 hover:border-blue-500/60 active:scale-[0.98] disabled:opacity-50"
        >
          <Plus className="size-4" /> Aggiungi altri file
        </button>
      </div>
    );
  }

  return (
    <div
      className="animate-rise"
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        handle(e.dataTransfer.files);
      }}
    >
      {inputs}
      <button
        type="button"
        data-testid="select-file-btn"
        onClick={() => allRef.current?.click()}
        className={`group relative flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[28px] border border-blue-400/30 bg-gradient-to-b from-blue-600 to-blue-700 px-6 py-10 text-white shadow-[0_18px_48px_-12px_rgba(37,99,235,0.55)] transition-transform duration-150 active:scale-[0.98] ${
          drag ? "ring-4 ring-cyan-400/60" : ""
        }`}
      >
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-white/10 animate-scan" />
        <span className="flex size-16 items-center justify-center rounded-2xl bg-white/15">
          <FolderOpen className="size-8" strokeWidth={2.2} />
        </span>
        <span className="font-heading text-2xl font-bold tracking-tight">Seleziona File</span>
        <span className="text-sm text-blue-100/90">Video, audio, foto · anche più file insieme</span>
      </button>
      <button
        type="button"
        data-testid="open-gallery-btn"
        onClick={() => galleryRef.current?.click()}
        className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-[#131B2A] font-semibold text-slate-100 transition-[transform,border-color] duration-150 hover:border-blue-500/50 active:scale-[0.98]"
      >
        <Images className="size-5 text-cyan-400" /> Apri Galleria
      </button>
    </div>
  );
}
