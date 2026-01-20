import { keyTableDisplayConfig } from "../config/keyTableDisplayConfig";

/**
 * Threshold for detecting temporary IDs.
 * Temporary IDs are created using -Date.now(), resulting in large negative numbers
 * (e.g., -1736441234567). Any ID below this threshold is considered temporary.
 */
export const TEMP_ID_THRESHOLD = -1000000000;

/**
 * Sync context interface - mirrors the essential parts of what useSyncOptional() returns.
 * This is passed as a parameter since we can't use hooks in a plain function.
 */
export interface SyncContext {
  syncedAction: (
    actionName: string,
    payload: Record<string, unknown>,
    onComplete?: (action: { result?: string }) => void
  ) => void;
}

/**
 * Parameters for saving a KeyTable item
 */
export interface SaveKeyTableItemParams {
  /** The item data with all field values (including id) */
  item: Record<string, unknown>;
  /** The updated form values to save */
  values: Record<string, unknown>;
  /** The key table name (e.g., "teams", "bauart", "rundsteuerempfaenger") */
  tableName: string;
  /** The sync context from useSyncOptional() - can be null if sync not available */
  sync: SyncContext | null;
  /** Optional callback when server confirms new item with real ID */
  onIdUpdated?: (oldId: number, newId: number, tableName: string) => void;
}

/**
 * Result of the save operation
 */
export interface SaveKeyTableItemResult {
  success: boolean;
  /** The item with updated values (id remains original until server confirms) */
  savedItem: Record<string, unknown>;
  /** Whether this was a new item (will need ID update from server) */
  isNewItem: boolean;
  /** Error message if success is false */
  error?: string;
}

/**
 * Saves or updates a KeyTable item using the sync system.
 *
 * Handles both new items (with temporary negative IDs like -1736441234567)
 * and existing items (with positive server-assigned IDs).
 *
 * For new items:
 * - Sends id: -1 to the server
 * - Registers an onComplete callback to update the temp ID to the real server-assigned ID
 *
 * For existing items:
 * - Sends the actual id to the server
 */
export const saveKeyTableItem = (
  params: SaveKeyTableItemParams
): SaveKeyTableItemResult => {
  const { item, values, tableName, sync, onIdUpdated } = params;

  // Check if sync is available
  if (!sync?.syncedAction) {
    return {
      success: false,
      savedItem: { ...values, id: item.id },
      isNewItem: false,
      error: "Synchronisation nicht verfügbar",
    };
  }

  // Determine if this is a new item
  // Temporary IDs are very large negative numbers (like -1736441234567)
  const isNewItem = !item.id || (item.id as number) < TEMP_ID_THRESHOLD;

  // Prepare data to save - new items send id: -1, existing items send their real id
  const dataToSave = { ...values, id: isNewItem ? -1 : item.id };

  // Get the API class name from config (may differ from tableName)
  // e.g., "teams" -> "team", "unterhaltMast" -> "tkey_unterh_mast"
  const apiClassName =
    keyTableDisplayConfig[tableName]?.apiClassName || tableName;

  // Capture the original item ID for the callback
  const originalItemId = item.id as number;

  // Create onComplete callback for new items to handle ID update
  const onComplete = isNewItem
    ? (action: { result?: string }) => {
        console.log("xxx syncHelper onComplete action:", action);
        if (action.result && onIdUpdated) {
          try {
            const result = JSON.parse(action.result);
            const newId = parseInt(result.id, 10);
            if (!isNaN(newId)) {
              onIdUpdated(originalItemId, newId, tableName);
            }
          } catch (e) {
            console.error("Failed to parse server response:", e, action.result);
          }
        } else {
          console.log(
            "syncHelper no result or no onIdUpdated. result:",
            action.result,
            "onIdUpdated:",
            !!onIdUpdated
          );
        }
      }
    : undefined;

  console.log(
    "xxx dataToSave " + (onComplete !== undefined ? "with onComplete" : ""),
    JSON.stringify(dataToSave),
    "isNewItem:",
    isNewItem,
    "item.id:",
    item.id,
    "typeof item.id:",
    typeof item.id
  );

  // Execute the synced action
  sync.syncedAction(
    "SaveObject",
    {
      className: apiClassName,
      data: JSON.stringify(dataToSave),
      status: "open",
    },
    onComplete
  );

  // Return the saved item (keeping original ID until server confirms)
  return {
    success: true,
    savedItem: { ...values, id: item.id },
    isNewItem,
  };
};

/**
 * Enhanced version of saveKeyTableItem that ALWAYS triggers onComplete callback.
 * Use this for forms with nested data (like ar_bausteineArray) that need fresh
 * server-assigned IDs after save.
 *
 * For forms without nested data, use the standard saveKeyTableItem instead.
 */
export const saveKeyTableItemWithCallback = (
  params: SaveKeyTableItemParams
): SaveKeyTableItemResult => {
  const { item, values, tableName, sync, onIdUpdated } = params;

  // Check if sync is available
  if (!sync?.syncedAction) {
    return {
      success: false,
      savedItem: { ...values, id: item.id },
      isNewItem: false,
      error: "Synchronisation nicht verfügbar",
    };
  }

  // Determine if this is a new item
  const isNewItem = !item.id || (item.id as number) < TEMP_ID_THRESHOLD;

  // Prepare data to save
  const dataToSave = { ...values, id: isNewItem ? -1 : item.id };

  // Get the API class name from config
  const apiClassName =
    keyTableDisplayConfig[tableName]?.apiClassName || tableName;

  // Capture the original item ID for the callback
  const originalItemId = item.id as number;

  // ALWAYS create onComplete callback (not just for new items)
  // This ensures fresh data is fetched after ANY save operation
  const onComplete = onIdUpdated
    ? (action: { result?: string }) => {
        if (action.result) {
          try {
            const result = JSON.parse(action.result);
            const newId = parseInt(result.id, 10);
            if (!isNaN(newId)) {
              onIdUpdated(originalItemId, newId, tableName);
            }
          } catch (e) {
            console.error("Failed to parse server response:", e, action.result);
          }
        }
      }
    : undefined;

  console.log(
    "xxx dataToSave " + (onComplete !== undefined ? "with onComplete" : ""),
    JSON.stringify(dataToSave),
    "isNewItem:",
    isNewItem,
    "item.id:",
    item.id,
    "typeof item.id:",
    typeof item.id
  );

  // Execute the synced action
  sync.syncedAction(
    "SaveObject",
    {
      className: apiClassName,
      data: JSON.stringify(dataToSave),
      status: "open",
    },
    onComplete
  );

  return {
    success: true,
    savedItem: { ...values, id: item.id },
    isNewItem,
  };
};
