import type { Dispatch } from "@reduxjs/toolkit";

/**
 * Separates action creators from selectors in a slice module.
 * Actions typically start with 'set', 'add', 'remove', 'update', 'toggle', etc.
 * Selectors typically start with 'get' or 'select'.
 */
function separateActionsAndSelectors(sliceModule: any) {
  const actions: Record<string, any> = {};
  const selectors: Record<string, any> = {};

  for (const [key, value] of Object.entries(sliceModule)) {
    if (typeof value === "function") {
      // Identify actions vs selectors by naming convention
      if (key.startsWith("get") || key.startsWith("select")) {
        selectors[key] = value;
      } else if (
        key.startsWith("set") ||
        key.startsWith("add") ||
        key.startsWith("remove") ||
        key.startsWith("update") ||
        key.startsWith("toggle") ||
        key.startsWith("change") ||
        key.startsWith("append") ||
        key.startsWith("delete")
      ) {
        actions[key] = value;
      }
    }
  }

  return { actions, selectors };
}

/**
 * Creates store actions and selectors from an array of slice configurations.
 * Actions are wrapped with dispatch, selectors are wrapped as custom hooks.
 *
 * @param sliceConfigs - Array of slice configurations
 * @param dispatch - Redux dispatch function
 * @param forwardedUseSelector - Redux useSelector function
 * @returns Separated actions and selectors objects
 */
export function createSlicesInterface(
  sliceConfigs: any[],
  dispatch: Dispatch,
  forwardedUseSelector: (selector: any) => any
) {
  const storeActions: Record<string, Record<string, any>> = {};
  const storeSelectors: Record<string, Record<string, any>> = {};

  for (const { name, slice } of sliceConfigs) {
    const { actions, selectors } = separateActionsAndSelectors(slice);

    // Wrap actions with dispatch
    const wrappedActions: Record<string, any> = {};
    for (const [actionName, actionCreator] of Object.entries(actions)) {
      wrappedActions[actionName] = (...args: any[]) => {
        const action = actionCreator(...args);
        return dispatch(action);
      };
    }

    // Wrap selectors as custom hooks for lib-agnostic usage
    const wrappedSelectors: Record<string, any> = {};
    for (const [selectorName, selector] of Object.entries(selectors)) {
      // Create a custom hook that wraps the selector with useSelector
      wrappedSelectors[selectorName] = () => forwardedUseSelector(selector);
    }

    storeActions[name] = wrappedActions;
    storeSelectors[name] = wrappedSelectors;
  }

  return {
    actions: storeActions,
    selectors: storeSelectors,
  };
}

export default createSlicesInterface;
