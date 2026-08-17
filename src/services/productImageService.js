import { auth } from './firebase';
import { compressImage } from '../utils/imageCompress';

// Product photo upload / removal for the public website.
//
// Uploads do NOT go directly to Supabase Storage. Supabase Storage
// currently rejects third-party (Firebase) auth tokens with an
// "invalid algorithm" error, so the browser cannot authenticate to it
// as the owner. Instead the image goes to an endpoint on the website,
// which verifies the Firebase ID token server-side and then writes
// using the service role key — a key that must never exist in this
// browser app.
//
// The image is still compressed here, on the device, so a 4 MB photo
// never crosses the network and the original never leaves the machine.
//
// Isolated by design: this module talks to its own endpoint and touches
// nothing else. If the website is unreachable, photo upload reports a
// clear error and the rest of Leo Billing is unaffected.

const API_BASE = import.meta.env.VITE_WEBSITE_API_URL || 'http://localhost:3000';
const ENDPOINT = `${API_BASE}/api/admin/product-image`;

async function authHeader() {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again to upload photos.');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

async function readError(res, fallback) {
  try {
    const body = await res.json();
    if (body?.error) return body.error;
  } catch {
    // fall through to the generic message
  }
  return fallback;
}

/**
 * Compress and upload a product photo.
 * @param {File} file
 * @returns {Promise<{ publicUrl: string, path: string, originalBytes: number, compressedBytes: number }>}
 */
export async function uploadProductImage(file) {
  const { blob, originalBytes } = await compressImage(file);

  const form = new FormData();
  form.append('file', blob, 'photo.webp');

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: await authHeader(),
      body: form,
    });
  } catch {
    throw new Error(
      `Could not reach the website at ${API_BASE}. Make sure it is running, then try again.`
    );
  }

  if (!res.ok) {
    throw new Error(await readError(res, 'Upload failed. Please try again.'));
  }

  const { url, path } = await res.json();
  return { publicUrl: url, path, originalBytes, compressedBytes: blob.size };
}

/**
 * Remove a previously uploaded photo. Best-effort — a failure here must
 * never block saving the product, so callers may ignore it.
 * @param {string} path
 */
export async function deleteProductImage(path) {
  if (!path) return;

  const res = await fetch(ENDPOINT, {
    method: 'DELETE',
    headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });

  if (!res.ok) {
    throw new Error(await readError(res, 'Could not remove that image.'));
  }
}
