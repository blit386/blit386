/**
 * The security headers every response carries, besides the CSP (`src/csp.ts`).
 *
 * `public/_headers` serves these on every `ASSETS` response, but a response the Worker builds itself
 * (markdown negotiation, `/feed.xml`, `/mcp`, the 405, Waku's on-demand 404) never passes through it,
 * so `cspNoncePlugin` adds any that are missing (BT-772). `public/_headers` is a hand-written copy of
 * these values - it cannot import - and `src/csp.test.ts` fails if the two drift apart.
 */
export const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
        'accelerometer=(), autoplay=(self), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), usb=()',
} as const;
