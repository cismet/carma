import type { DevicePixels } from "@carma-units";

export type ImageQualityPreset = Readonly<{
  id: string;
  label: string;
  center: readonly [number, number];
}>;
export type ImageQualityVariant = Readonly<{
  bitDepth: 8 | 10;
  chroma: "444" | "420";
  encoderQuality: number;
  ssimulacra2: number;
  bytes: number;
  href: string;
  errorTiles?: Readonly<{ baseUrl: string; tileSize: DevicePixels; gain: 32 }>;
  offlineRGBPsnrDb?: number;
}>;
export type ImageQualitySource = Readonly<{
  id: string;
  groupId?: string;
  level?: 0 | 1 | 2 | 3 | 4;
  referenceTiles?: Readonly<{ baseUrl: string; tileSize: DevicePixels }>;
  presets?: readonly ImageQualityPreset[];
  label: string;
  width: DevicePixels;
  height: DevicePixels;
  variants: readonly ImageQualityVariant[];
}>;
export type ImageQualityManifest = Readonly<{
  tileSize: DevicePixels;
  sources: readonly ImageQualitySource[];
}>;

const httpUrl = (value: unknown, base: string): string => {
  if (typeof value !== "string") throw new Error("Missing image URL");
  const url = new URL(value, base);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Image URL must use HTTP");
  return url.href;
};

const parseComparisonTiles = (raw: unknown, base: string) => {
  const tiles = raw as Record<string, unknown> | null;
  if (!tiles || tiles.tileSize !== 512)
    throw new Error("Invalid comparison tile size");
  return {
    baseUrl: httpUrl(tiles.baseUrl, base),
    tileSize: 512 as DevicePixels,
  };
};

/** Comparison files remain external assets; quality scores must come from decoded references. */
export const parseImageQualityManifest = (
  raw: unknown,
  base: string
): ImageQualityManifest => {
  const document = raw as Record<string, unknown> | null;
  if (
    !document ||
    document.schemaVersion !== 1 ||
    document.tileSize !== 512 ||
    !Array.isArray(document.sources) ||
    document.sources.length < 1 ||
    document.sources.length > 16
  )
    throw new Error("Expected a versioned 512-pixel comparison manifest");
  const ids = new Set<string>();
  const sources = document.sources.map((source) => {
    if (
      !source ||
      typeof source.id !== "string" ||
      ids.has(source.id) ||
      typeof source.label !== "string" ||
      (source.groupId !== undefined && typeof source.groupId !== "string") ||
      (source.level !== undefined &&
        (!Number.isInteger(source.level) ||
          source.level < 0 ||
          source.level > 4)) ||
      !Number.isSafeInteger(source.width) ||
      !Number.isSafeInteger(source.height) ||
      source.width < 1 ||
      source.height < 1 ||
      source.width > 16384 ||
      source.height > 16384 ||
      !Array.isArray(source.variants) ||
      source.variants.length < 1 ||
      source.variants.length > 256
    )
      throw new Error("Invalid comparison source");
    ids.add(source.id);
    const variants = source.variants.map((variant: Record<string, unknown>) => {
      const offlineRGBPsnrDb =
        variant?.offlineRGBPsnrDb ?? variant?.offlineRgbPsnrDb;
      if (
        !variant ||
        (variant.bitDepth !== 8 && variant.bitDepth !== 10) ||
        (variant.chroma !== "444" && variant.chroma !== "420") ||
        typeof variant.encoderQuality !== "number" ||
        !Number.isFinite(variant.encoderQuality) ||
        variant.encoderQuality < 0 ||
        variant.encoderQuality > 100 ||
        typeof variant.ssimulacra2 !== "number" ||
        !Number.isFinite(variant.ssimulacra2) ||
        variant.ssimulacra2 > 100 ||
        !Number.isSafeInteger(variant.bytes) ||
        (variant.bytes as number) < 1 ||
        (variant.bytes as number) > 64 * 1024 * 1024 ||
        (offlineRGBPsnrDb !== undefined &&
          (typeof offlineRGBPsnrDb !== "number" ||
            !Number.isFinite(offlineRGBPsnrDb) ||
            offlineRGBPsnrDb <= 0))
      )
        throw new Error("Invalid measured image variant");
      const errorTiles =
        variant.errorTiles !== undefined
          ? {
              ...parseComparisonTiles(variant.errorTiles, base),
              gain: 32 as const,
            }
          : undefined;
      if (
        variant.errorTiles !== undefined &&
        (variant.errorTiles as { gain?: unknown }).gain !== 32
      )
        throw new Error("Expected offline RGB-error gain 32");
      return {
        ...variant,
        errorTiles,
        offlineRGBPsnrDb,
        href: httpUrl(variant.href, base),
      } as ImageQualityVariant;
    });
    const referenceTiles = source.referenceTiles
      ? parseComparisonTiles(source.referenceTiles, base)
      : undefined;
    let presets: ImageQualityPreset[] | undefined;
    if (source.presets !== undefined) {
      if (
        !Array.isArray(source.presets) ||
        !source.presets.length ||
        source.presets.length > 16
      )
        throw new Error("Invalid comparison presets");
      const presetIds = new Set<string>();
      presets = source.presets.map((preset: ImageQualityPreset) => {
        if (
          !preset ||
          typeof preset.id !== "string" ||
          !preset.id ||
          presetIds.has(preset.id) ||
          typeof preset.label !== "string" ||
          !preset.label ||
          !Array.isArray(preset.center) ||
          preset.center.length !== 2 ||
          !preset.center.every(
            (value) => Number.isFinite(value) && value >= 0 && value <= 1
          )
        )
          throw new Error("Invalid normalized comparison preset");
        presetIds.add(preset.id);
        return {
          id: preset.id,
          label: preset.label,
          center: [...preset.center] as [number, number],
        };
      });
    }
    return {
      ...source,
      variants,
      referenceTiles,
      presets,
    } as ImageQualitySource;
  });
  return { tileSize: 512 as DevicePixels, sources };
};

export const chromaSubsamplingMeetsPolicy = (
  baselineMs: number,
  candidateMs: number,
  candidateScore: number,
  targetScore: number
): boolean =>
  Number.isFinite(baselineMs) &&
  Number.isFinite(candidateMs) &&
  baselineMs > 0 &&
  candidateMs > 0 &&
  candidateScore >= targetScore &&
  candidateMs <= baselineMs * 0.67;

/** A common measured target is independent of the encoder's quality scale. */
export const chooseImageQualityVariant = (
  variants: readonly ImageQualityVariant[],
  bitDepth: 8 | 10,
  chroma: "444" | "420",
  target: number
) => {
  const matching = variants.filter(
    (variant) => variant.bitDepth === bitDepth && variant.chroma === chroma
  );
  const eligible = matching
    .filter((variant) => variant.ssimulacra2 >= target)
    .sort((a, b) => a.bytes - b.bytes || b.ssimulacra2 - a.ssimulacra2);
  return {
    variant:
      eligible[0] ??
      matching
        .slice()
        .sort((a, b) => b.ssimulacra2 - a.ssimulacra2 || a.bytes - b.bytes)[0],
    meetsTarget: eligible.length > 0,
  };
};
