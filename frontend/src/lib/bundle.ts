import { zip } from "fflate";
import type { EncryptedMetaPlain } from "@shared/types";

export interface Bundle {
  blob: Blob;
  meta: EncryptedMetaPlain;
}

/** One file → sent as-is. Several files → zipped in the browser (store only, no compression). */
export async function bundleFiles(files: File[]): Promise<Bundle> {
  if (files.length === 1) {
    const [f] = files;
    return { blob: f, meta: { name: f.name, contentType: f.type || "application/octet-stream", size: f.size } };
  }

  const entries: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const f of files) {
    entries[uniqueName(f.name, used)] = new Uint8Array(await f.arrayBuffer());
  }

  const zipped = await new Promise<Uint8Array>((resolve, reject) =>
    zip(entries, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data))),
  );
  const blob = new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" });

  return {
    blob,
    meta: {
      name: `${files.length}-files.zip`,
      contentType: "application/zip",
      size: blob.size,
      files: files.map((f) => ({ name: f.name, size: f.size })),
    },
  };
}

function uniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; used.has(candidate); i++) candidate = `${base} (${i})${ext}`;
  used.add(candidate);
  return candidate;
}
