// Client-side image compression for product photos.
//
// Goal: high visual quality at a small file size, so the public website
// loads fast and the Supabase free tier (1 GB) comfortably holds the
// whole catalogue.
//
// Approach: downscale to a sensible max dimension, then re-encode as
// WebP. WebP typically lands 25-35% smaller than JPEG at matching
// quality. A 4 MB phone photo usually comes out around 150-300 KB with
// no visible loss at the sizes the website actually displays.
//
// Runs entirely in the browser — no server round-trip, and the original
// full-size file never leaves the device.

const MAX_DIMENSION = 1600; // longest edge; ample for a full-width hero
const QUALITY = 0.82;       // sweet spot: artefact-free on cake textures
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Compress an image File into a WebP Blob.
 * @param {File} file
 * @returns {Promise<{ blob: Blob, width: number, height: number, originalBytes: number }>}
 */
export async function compressImage(file) {
  if (!(file instanceof File)) throw new Error('No file provided.');

  // Validate by decoding, not by trusting the extension or the
  // browser-reported MIME type — both are attacker-controlled. If it
  // doesn't decode as an image, it isn't one.
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Please choose a JPG, PNG, or WebP image.');
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That file could not be read as an image.');
  });

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_DIMENSION);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    // Better downscaling quality than the default nearest-ish sampling.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Image compression failed.'))),
        'image/webp',
        QUALITY
      );
    });

    if (blob.size > MAX_OUTPUT_BYTES) {
      throw new Error('That image is too large even after compression.');
    }

    return { blob, width, height, originalBytes: file.size };
  } finally {
    bitmap.close?.();
  }
}

function fitWithin(w, h, max) {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = max / Math.max(w, h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
