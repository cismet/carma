import type { CesiumRuntime } from "../CesiumContext";

import { useCesiumContext } from "./useCesiumContext";
export const useCesiumRuntime = (): CesiumRuntime | undefined => {
  const { withRuntime } = useCesiumContext();
  let runtime: CesiumRuntime | undefined;
  withRuntime((v) => {
    runtime = v;
  });
  if (!runtime) {
    return;
  }
  return runtime;
};
