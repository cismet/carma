import localforage from "localforage";

// Ported from react-cismap src/lib/contexts/_helper.js (unchanged behaviour).
export const setFromLocalforage = async (
  lfKey: string,
  setter: (value: unknown) => void,
  fallbackValue?: unknown,
  forceFallback?: boolean
): Promise<void> => {
  const value = await localforage.getItem(lfKey);
  if (value !== undefined && value !== null) {
    setter(value);
  } else if (fallbackValue !== undefined || forceFallback === true) {
    setter(fallbackValue);
  }
};
