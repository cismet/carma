import type { CesiumRuntime } from "../CesiumContext";

import { useCesiumContext } from "./useCesiumContext";

export const useCesiumRuntime = (): CesiumRuntime | undefined => {
  const { withRuntime } = useCesiumContext();
  return withRuntime((runtime) => runtime);
};
