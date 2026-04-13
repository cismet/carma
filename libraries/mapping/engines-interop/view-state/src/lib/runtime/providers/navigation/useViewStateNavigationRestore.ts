import type { ViewState } from "../../../core/types";
import { useViewStateNavigationContext } from "./useViewStateNavigationContext";
export type UseViewStateNavigationRestoreResult = {
  restoreState: ViewState | null;
  isRestoreResolved: boolean;
};

export const useViewStateNavigationRestore =
  (): UseViewStateNavigationRestoreResult => {
    const { restoreState, isRestoreResolved } = useViewStateNavigationContext();

    return {
      restoreState,
      isRestoreResolved,
    };
  };
