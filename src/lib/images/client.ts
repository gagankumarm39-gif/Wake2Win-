"use client";

/**
 * Client-side image preparation shared by NCERT Scanner and Image Chat:
 * validate → decode → downscale to ≤2048px → re-encode as JPEG data URL.
 * Keeps uploads small (faster OCR/vision, well under the 10MB request cap)
 * and normalizes HEIC/PNG/camera captures into one predictable format.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_DIMENSION_PX = 2048;
const JPEG_QUALITY = 0.85;

export interface PreparedImage {
  /** data:image/jpeg;base64,… ready for the API. */
  dataUrl: string;
  /** Object URL for instant previews (callers revoke it on removal). */
  previewUrl: string;
  name: string;
  /** Bytes of the compressed payload (approximate, from base64 length). */
  bytes: number;
}

function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor(base64.length * 0.75);
}

function loadBitmap(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image. Try another file."));
    };
    img.src = url;
  });
}

/**
 * Validate + resize + compress one file. Throws Error with a user-readable
 * message on unsupported/oversized input.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`"${file.name}" is not an image.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" is larger than 10 MB. Please pick a smaller image.`);
  }

  const img = await loadBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(img.src);
    throw new Error("Image processing is not supported in this browser.");
  }
  // White backing so transparent PNGs don't turn black as JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return {
    dataUrl,
    previewUrl: img.src, // reuse the object URL created for decoding
    name: file.name,
    bytes: dataUrlBytes(dataUrl),
  };
}

/** Prepare several files, keeping successes and reporting the first failure. */
export async function prepareImages(
  files: File[]
): Promise<{ images: PreparedImage[]; error: string | null }> {
  const images: PreparedImage[] = [];
  let error: string | null = null;
  for (const file of files) {
    try {
      images.push(await prepareImage(file));
    } catch (err) {
      error ??= err instanceof Error ? err.message : "Could not process an image.";
    }
  }
  return { images, error };
}
