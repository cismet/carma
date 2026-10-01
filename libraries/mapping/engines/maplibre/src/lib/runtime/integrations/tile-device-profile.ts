import type { TilesDeviceProfile } from "../../core/tile-cache-policy";

/** Browser hints feed the shared cache policy; they are not allocation grants. */
export const readTileDeviceProfile = (): TilesDeviceProfile => {
  if (typeof navigator === "undefined")
    return { userAgent: "", platform: "", maxTouchPoints: 0 };
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  return {
    deviceMemoryGiB: typeof memory === "number" ? memory : undefined,
    userAgent: navigator.userAgent ?? "",
    platform: navigator.platform ?? "",
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
};
