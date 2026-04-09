import React, { useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  accept?: string;       // e.g. ".csv,.xlsx"
  maxBytes?: number;     // e.g. 25 * 1024 * 1024
  error?: string | null;
}

/**
 * Drag-and-drop file upload zone with client-side type/size validation.
 */
export default function FileDropzone({
  onFile,
  accept = ".csv,.xlsx",
  maxBytes = 25 * 1024 * 1024,
  error,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function validate(file: File): string | null {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowedExts = accept.split(",").map((a) => a.replace(".", "").toLowerCase());
    if (!allowedExts.includes(ext)) {
      return `Invalid file type. Allowed: ${accept}`;
    }
    if (file.size > maxBytes) {
      return `File too large. Maximum size is ${Math.round(maxBytes / (1024 * 1024))} MB.`;
    }
    return null;
  }

  function handleFile(file: File) {
    const err = validate(file);
    setLocalError(err);
    if (!err) onFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset so same file can be re-selected
    e.target.value = "";
  }

  const displayError = localError ?? error;

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#0d6efd" : "#ced4da"}`,
          borderRadius: "10px",
          padding: "2.5rem 1.5rem",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "#f0f7ff" : "#fafafa",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📂</div>
        <div style={{ fontWeight: 600, color: "#212529", marginBottom: "0.25rem" }}>
          Drag & drop a file here
        </div>
        <div style={{ color: "#6c757d", fontSize: "0.85rem" }}>
          or click to browse — {accept} up to {Math.round(maxBytes / (1024 * 1024))} MB
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={onInputChange}
        />
      </div>
      {displayError && (
        <div style={{ color: "#dc3545", fontSize: "0.85rem", marginTop: "0.5rem" }}>
          {displayError}
        </div>
      )}
    </div>
  );
}
