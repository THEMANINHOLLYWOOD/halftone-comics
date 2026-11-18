"use client";

// Sending a dropped file to where the server can read it, and naming what it is.

import { upload as uploadToBlob } from "@vercel/blob/client";
import type { UploadRef } from "./types";

/** Local development: send the file to this server. */
export function sendToServer(file: File, onProgress: (fraction: number) => void): Promise<UploadRef> {
  // XMLHttpRequest rather than fetch: it reports progress, which matters for video.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as { upload?: UploadRef; error?: string };
        if (xhr.status < 300 && body.upload) resolve(body.upload);
        else reject(new Error(body.error ?? "The upload failed."));
      } catch {
        reject(new Error("The upload failed."));
      }
    };
    xhr.onerror = () => reject(new Error("The upload failed. Check your connection and try again."));
    xhr.send(file);
  });
}

/** On Vercel: send the file straight to the private Blob store, in parts when it is big. */
export async function sendToBlob(file: File, onProgress: (fraction: number) => void): Promise<UploadRef> {
  const safe = file.name.replace(/[^\w.-]+/g, "-").replace(/^-+/, "").slice(-80) || "file";
  const result = await uploadToBlob(`uploads/${safe}`, file, {
    // Private: people's photos and videos are never public.
    access: "private",
    handleUploadUrl: "/api/uploads/blob",
    contentType: file.type || undefined,
    multipart: file.size > 40 * 1024 * 1024,
    onUploadProgress: ({ percentage }) => onProgress(percentage / 100),
  });
  return { ref: result.url, name: file.name, mime: file.type, size: file.size };
}

export function asLink(value: string): string | null {
  const trimmed = value.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

export function kindOf(file: File): string {
  const type = file.type;
  if (type.startsWith("image/")) return "Photo";
  if (type.startsWith("video/")) return "Video";
  if (type.startsWith("audio/")) return "Audio";
  if (type === "application/pdf") return "PDF";
  return (file.name.split(".").pop() ?? "File").toUpperCase().slice(0, 5);
}
