const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * A private network address (RFC 1918 / RFC 4193) or an mDNS name: the app
 * served from a developer machine to a phone on the same Wi-Fi. None of these
 * can be a public deployment, so they count as local development, which is
 * what makes the development-only routes and UI reachable on a real device.
 */
const PRIVATE_HOSTNAME_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^\[?(fc|fd)[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  /\.local$/i,
  /\.localhost$/i,
];

export const isLocalhostHostname = (
  hostname: string | null | undefined
): boolean =>
  !!hostname &&
  (LOCALHOST_HOSTNAMES.has(hostname) ||
    PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname)));
