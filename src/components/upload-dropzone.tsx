"use client";

import { useCallback, useRef, useState } from "react";
import { Camera } from "lucide-react";

interface UploadDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function UploadDropzone({ onFileSelected, disabled }: UploadDropzoneProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (disabled) return;
      setPreview(URL.createObjectURL(file));
      onFileSelected(file);
    },
    [disabled, onFileSelected]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "image/jpeg" || file.type === "image/png")) {
      handleFile(file);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleClick() {
    if (!disabled) inputRef.current?.click();
  }

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
        disabled
          ? "cursor-not-allowed border-zinc-700 opacity-50"
          : dragOver
            ? "border-blue-500 bg-blue-500/5"
            : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      {preview ? (
        <div className="flex flex-col items-center gap-3">
          <img
            src={preview}
            alt="Preview"
            className="max-h-64 rounded-md object-contain"
          />
          <p className="text-sm text-zinc-400">Click or drop to replace</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Camera className="h-10 w-10 text-zinc-500" />
          <p className="text-sm font-medium text-zinc-300">
            Drop rice grain image here
          </p>
          <p className="text-xs text-zinc-500">or click to browse</p>
        </div>
      )}
    </div>
  );
}
