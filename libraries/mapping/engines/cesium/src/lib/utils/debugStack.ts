import type { CesiumContextType } from "../CesiumContext";

// ignoreLevels for use in wrappers to only list the actual caller

export function pushDebugStack(ctx: CesiumContextType, ignoreLevels = 0): void {
  if (!ctx.debug || !ctx.pushCesiumCallstack) return;
  const localIgnoreLevels = ignoreLevels + 1; // +1 for this function
  const frame =
    new Error().stack?.split("\n")?.[localIgnoreLevels]?.trim() ?? "<unknown>";
  ctx.pushCesiumCallstack(frame);
}
