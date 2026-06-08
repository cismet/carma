import { isLocalhostHostname } from "@carma-commons/utils";
import { useFeatureFlags } from "@carma-providers/feature-flag";

export type DevelopmentUiFeatureFlags = {
  isDeveloperMode?: boolean;
};

export type DevelopmentUiEnabledOptions = {
  flags?: DevelopmentUiFeatureFlags | null;
  hostname?: string | null;
};

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
