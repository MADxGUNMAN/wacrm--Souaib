// Moved to src/lib/http/request-origin.ts so billing routes can share it.
// Kept as a re-export so existing super-admin imports keep working.
export { isSameOrigin } from '@/lib/http/request-origin';
