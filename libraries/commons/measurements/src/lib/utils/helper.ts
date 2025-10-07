import localforage from "localforage";

export const setFromLocalforage = async (
  lfKey: string,
  setter: (value: any) => void,
  fallbackValue?: any,
  forceFallback?: boolean
) => {
  try {
    const value = await localforage.getItem(lfKey);
    if (value !== undefined && value !== null) {
      setter(value);
    } else if (fallbackValue !== undefined || forceFallback === true) {
      setter(fallbackValue);
    }
  } catch (error) {
    console.warn(`Failed to load ${lfKey} from localStorage:`, error);
    if (fallbackValue !== undefined || forceFallback === true) {
      setter(fallbackValue);
    }
  }
};

export const saveToLocalforage = async (lfKey: string, value: any) => {
  try {
    await localforage.setItem(lfKey, value);
  } catch (error) {
    console.warn(`Failed to save ${lfKey} to localStorage:`, error);
  }
};
