/** Trigger a browser download for a decrypted blob. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(name);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before freeing the memory.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** The name comes from the sender, so strip path separators and control characters. */
function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim();
  return cleaned.slice(0, 200) || "download";
}
