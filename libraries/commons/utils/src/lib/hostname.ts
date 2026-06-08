const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const isLocalhostHostname = (
  hostname: string | null | undefined
): boolean => !!hostname && LOCALHOST_HOSTNAMES.has(hostname);
