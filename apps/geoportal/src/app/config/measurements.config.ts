import { APP_KEY } from "./index";

export const MEASUREMENTS_BASE_CONFIG = {
  editableTitle: true,
  snappingEnabled: false,
  snappingOnUpdate: false,
  localStorageKey: "@" + APP_KEY + ".app.measurements",
} as const;
