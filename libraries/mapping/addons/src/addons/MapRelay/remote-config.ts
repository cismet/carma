import type { carma as carmaApi, MappingConfig } from "@carma-api";

/**
 * What a show asks a page to show: the id of a shared configuration, the same
 * value `?usedConfig=` takes, or the configuration itself.
 */
export type RemoteConfig = string | MappingConfig;

export const isRemoteConfig = (value: unknown): value is RemoteConfig =>
  typeof value === "string" || (typeof value === "object" && value !== null);

/** what a config field was applied as, so re-delivering it changes nothing */
export const configIdentity = (value: RemoteConfig): string =>
  typeof value === "string" ? `id:${value}` : `doc:${JSON.stringify(value)}`;

/** for the log */
export const configLabel = (value: RemoteConfig): string =>
  typeof value === "string"
    ? value
    : `a configuration with ${value.layers?.length ?? 0} layer(s)`;

/** false when it is unusable, or when a newer configuration overtook it */
export const applyRemoteConfig = (
  carma: typeof carmaApi,
  value: RemoteConfig
): Promise<boolean> =>
  typeof value === "string"
    ? carma.config.applyById(value)
    : carma.config.setMappingConfig(value);
