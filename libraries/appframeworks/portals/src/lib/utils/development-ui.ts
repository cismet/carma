import { useFeatureFlags } from "@carma-providers/feature-flag";

export type DevelopmentUiFeatureFlags = {
  isDeveloperMode?: boolean;
};

export type DevelopmentUiEnabledOptions = {
  flags?: DevelopmentUiFeatureFlags | null;
  hostname?: string | null;
};

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const isLocalhostHostname = (
  hostname: string | null | undefined
): boolean => !!hostname && LOCALHOST_HOSTNAMES.has(hostname);

export const isDevelopmentUiEnabled = ({
  flags,
  hostname = typeof window !== "undefined"
    ? window.location.hostname
    : undefined,
}: DevelopmentUiEnabledOptions = {}): boolean =>
  flags?.isDeveloperMode === true || isLocalhostHostname(hostname);

export const useDevelopmentUiEnabled = (): boolean => {
  const flags = useFeatureFlags() as DevelopmentUiFeatureFlags;

  return isDevelopmentUiEnabled({ flags });
};
