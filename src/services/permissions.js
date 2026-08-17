// Who may see the Website control section.
//
// The website — store on/off, orders, delivery areas — is deliberately
// limited to the business owner. Other allow-listed accounts can still
// use billing normally; they just don't get the storefront controls.
//
// This hides the UI. It is NOT the security boundary: the real gate is
// OWNER_FIREBASE_UIDS on the website's admin API, which verifies the
// Firebase token server-side before touching anything. Hiding a nav
// item stops mistakes; the API stops misuse.
export const WEBSITE_ADMIN_UIDS = [
  'f7qgUXdOXpRUDtiYUIzgoXGTfe63',
];

export const canManageWebsite = (user) =>
  !!user?.uid && WEBSITE_ADMIN_UIDS.includes(user.uid);
