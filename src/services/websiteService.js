import { auth } from './firebase';

// Website control: content, offers, gallery, review moderation, and
// website order requests.
//
// These tables have RLS enabled with no policies for the anon key, so
// the browser cannot read or write them directly — and shouldn't be
// able to, since the anon key ships inside the deployed bundle. Every
// call here goes to the website's admin API, which verifies this
// user's Firebase ID token server-side and then acts with the service
// role key.
//
// Isolated by design: this module only talks to that one endpoint. If
// the website is unreachable, the Website section reports it and the
// rest of Leo Billing is unaffected.

const API_BASE = import.meta.env.VITE_WEBSITE_API_URL || 'http://localhost:3000';
const ENDPOINT = `${API_BASE}/api/admin/cms`;

async function authHeader() {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

async function readError(res, fallback) {
  try {
    const body = await res.json();
    if (body?.error) return body.error;
  } catch {
    // fall through
  }
  return fallback;
}

async function apiGet(resource) {
  let res;
  try {
    res = await fetch(`${ENDPOINT}?resource=${encodeURIComponent(resource)}`, {
      headers: await authHeader(),
    });
  } catch {
    throw new Error(
      `Could not reach the website at ${API_BASE}. Make sure it is running.`
    );
  }
  if (!res.ok) throw new Error(await readError(res, 'Could not load that.'));
  return res.json();
}

async function apiPost(payload) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      `Could not reach the website at ${API_BASE}. Make sure it is running.`
    );
  }
  if (!res.ok) throw new Error(await readError(res, 'That change did not save.'));
  return res.json();
}

// ── Site content ─────────────────────────────────────────────
export const getSiteContent = () => apiGet('content');

export const saveSiteContent = (key, value) =>
  apiPost({ action: 'save_content', key, value });

// ── Gallery ──────────────────────────────────────────────────
export const getGalleryImages = () => apiGet('gallery');

export const addGalleryImage = ({ image_url, image_path, caption, alt_text }) =>
  apiPost({ action: 'add_gallery', image_url, image_path, caption, alt_text });

export const updateGalleryImage = (id, fields) =>
  apiPost({ action: 'update_gallery', id, ...fields });

export const removeGalleryImage = (id) =>
  apiPost({ action: 'delete_gallery', id });

// ── Offers ───────────────────────────────────────────────────
export const getOffers = () => apiGet('offers');

export const saveOffer = (offer) =>
  apiPost({ action: 'save_offer', ...offer });

export const deleteOffer = (id) => apiPost({ action: 'delete_offer', id });

// ── Reviews (moderation) ─────────────────────────────────────
export const getReviews = () => apiGet('reviews');

export const setReviewPublished = (id, isPublished) =>
  apiPost({ action: 'set_review_published', id, is_published: isPublished });

export const deleteReview = (id) => apiPost({ action: 'delete_review', id });

// ── Website orders ───────────────────────────────────────────
export const getWebsiteOrders = () => apiGet('orders');

export const setOrderStatus = (id, status) =>
  apiPost({ action: 'set_order_status', id, status });

// Links a saved Leo Billing invoice to a website order so the customer
// can view their bill. The invoice itself stays entirely in Leo Billing.
export const linkOrderInvoice = (orderId, invoiceId) =>
  apiPost({ action: 'link_order_invoice', order_id: orderId, invoice_id: invoiceId });

export const deleteOrder = (id) => apiPost({ action: 'delete_order', id });

// ── Store open / closed ──────────────────────────────────────
export const getStoreSettings = () => apiGet('store');

export const setStoreOpen = (accepting, offlineMessage) =>
  apiPost({
    action: 'set_store_open',
    accepting_orders: accepting,
    offline_message: offlineMessage,
  });

// ── Delivery areas ───────────────────────────────────────────
export const getPincodes = () => apiGet('pincodes');

export const addPincode = ({ pincode, area_name, delivery_fee }) =>
  apiPost({ action: 'add_pincode', pincode, area_name, delivery_fee });

export const updatePincode = (id, fields) =>
  apiPost({ action: 'update_pincode', id, ...fields });

export const deletePincode = (id) => apiPost({ action: 'delete_pincode', id });

// ── Stats ────────────────────────────────────────────────────
export const getWebsiteStats = () => apiGet('stats');
