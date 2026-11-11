// Shared between AdminBar (Card Management's inline login) and AdminPage
// (the /admin room-management hub) - both read/write the same token so
// logging in on either page carries over to the other, matching the single
// shared admin session on the server (server/src/admin/auth.ts).
export const ADMIN_TOKEN_KEY = "tj-admin-token";
