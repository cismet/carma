import type { TaskItemFormatter } from "@carma-providers/syncing";

/**
 * Custom task formatter for belis-desktop app.
 * Formats action items for display in the TaskPanel.
 */
export const belisTaskFormatter: TaskItemFormatter = (doc, params) => {
  // Parse the data to get item details
  let itemData: Record<string, unknown> = {};
  const dataStr = params.data as string | undefined;
  if (dataStr) {
    try {
      itemData = JSON.parse(dataStr);
    } catch {
      // Ignore parse errors
    }
  }

  // Determine action type based on action and id
  let actionStatus: "createObject" | "editObject" | "deleteObject" | "unknown" =
    "unknown";
  if (doc.action === "SaveObject") {
    const id = itemData.id as number | undefined;
    actionStatus = id === -1 ? "createObject" : "editObject";
  } else if (doc.action === "DeleteObject") {
    actionStatus = "deleteObject";
  }

  // Determine object description
  let fachobjekt = "Objekt";
  let beschreibung = doc.action;

  const className = params.className as string | undefined;
  if (className) {
    fachobjekt = `${className}`;
    if (itemData.id && (itemData.id as number) > 0) {
      fachobjekt += ` #${itemData.id}`;
    }
  }

  if (doc.action === "SaveObject") {
    beschreibung =
      itemData.id && (itemData.id as number) > 0
        ? "Objekt aktualisiert"
        : "Neues Objekt erstellt";
  } else if (doc.action === "DeleteObject") {
    beschreibung = "Objekt gelöscht";
  }

  return {
    actionStatus,
    fachobjekt,
    beschreibung,
  };
};
