import Icon from "react-cismap/commons/Icon";
interface Feature {
  id: number;
  properties: {
    baumart_botanisch: string;
    standort_nr: string;
    zusatz: string;
    lfd_nr_str: string;
    pflanzjahr: string;
    standalter_jahr: string;
    hoehe_m: string;
    stammumfang_cm: string;
    ortlicher_bezug: string;
    actions?: any[];
    latestActionStatus?: string;
    info?: {
      foto?: string;
      fotos?: string[];
      fotoCaptions?: string[];
      headerColor?: string;
      header?: string;
    };
  };
}

interface Action {
  status: string;
  action_time?: string;
}

export const computeLatestStatus = (actions?: Action[]) => {
  if (!actions || actions.length === 0) return "none";

  // Sort by action_time descending to get the most recent action
  const sortedActions = [...actions].sort((a, b) => {
    const timeA = a.action_time ? new Date(a.action_time).getTime() : 0;
    const timeB = b.action_time ? new Date(b.action_time).getTime() : 0;
    return timeB - timeA; // descending order (newest first)
  });

  return sortedActions[0]?.status || "none";
};

export const hasStatus = (actions?: Action[], status?: string) => {
  if (!actions || actions.length === 0) return false;
  return actions.some((a) => a.status === status);
};

interface FeatureCollection {
  features: Array<{
    properties: {
      actions?: Action[];
      [key: string]: any;
    };
    [key: string]: any;
  }>;
  [key: string]: any;
}

/**
 * Enriches a feature collection with tree actions
 * @param fc - The base feature collection (trees)
 * @param treeActions - Array of tree actions (links tree to action)
 * @param actions - Array of action definitions
 * @returns Object with enriched feature collection and max treeaction ID
 */
export const enrichFeatureCollectionWithActions = (
  fc: FeatureCollection,
  treeActions: any[],
  actions: any[]
) => {
  // Create a lookup map for actions by ID
  const actionMap = new Map(actions.map((a) => [a.id, a]));

  // Group tree actions by tree ID
  const treeActionsMap = new Map<number, any[]>();
  let maxTreeActionId = 0;

  treeActions.forEach((ta) => {
    const treeId = ta.fk_tree;
    if (!treeActionsMap.has(treeId)) {
      treeActionsMap.set(treeId, []);
    }

    // Enrich tree action with action definition reference (memory efficient)
    const enrichedAction = {
      ...ta,
      actionDefinition: actionMap.get(ta.fk_action),
    };

    treeActionsMap.get(treeId)!.push(enrichedAction);

    // Track max ID
    if (ta.id > maxTreeActionId) {
      maxTreeActionId = ta.id;
    }
  });

  // Enrich features with their actions
  const enrichedFeatures = fc.features.map((f) => {
    const treeId = f.id;
    const treeActionsForTree = treeActionsMap.get(treeId) || [];

    return {
      ...f,
      properties: {
        ...f.properties,
        actions: treeActionsForTree,
        // Add computed properties
        latestActionStatus: computeLatestStatus(treeActionsForTree),
        hasOpenActions: hasStatus(treeActionsForTree, "open"),
        actionCount: treeActionsForTree.length,
      },
    };
  });

  return {
    featureCollection: {
      ...fc,
      features: enrichedFeatures,
    },
    maxTreeActionId,
  };
};

/**
 * Updates an existing enriched feature collection with new tree actions
 * @param fc - The already enriched feature collection
 * @param newTreeActions - Array of new tree actions to add
 * @param actions - Array of action definitions
 * @returns Object with updated feature collection and new max treeaction ID
 */
export const updateFeatureCollectionWithNewActions = (
  fc: FeatureCollection,
  newTreeActions: any[],
  actions: any[]
) => {
  // Create a lookup map for actions by ID
  const actionMap = new Map(actions.map((a) => [a.id, a]));

  // Group new tree actions by tree ID
  const newActionsMap = new Map<number, any[]>();
  let maxTreeActionId = 0;

  newTreeActions.forEach((ta) => {
    const treeId = ta.fk_tree;
    if (!newActionsMap.has(treeId)) {
      newActionsMap.set(treeId, []);
    }

    // Enrich tree action with action definition reference (memory efficient)
    const enrichedAction = {
      ...ta,
      actionDefinition: actionMap.get(ta.fk_action),
    };

    newActionsMap.get(treeId)!.push(enrichedAction);

    // Track max ID
    if (ta.id > maxTreeActionId) {
      maxTreeActionId = ta.id;
    }
  });

  // Update features with new actions
  const updatedFeatures = fc.features.map((f) => {
    const treeId = f.id;
    const newActionsForTree = newActionsMap.get(treeId);

    if (!newActionsForTree || newActionsForTree.length === 0) {
      // No new actions for this tree
      return f;
    }

    // Merge new actions with existing ones
    const existingActions = f.properties.actions || [];
    const mergedActions = [...existingActions, ...newActionsForTree];

    return {
      ...f,
      properties: {
        ...f.properties,
        actions: mergedActions,
        // Recompute properties
        latestActionStatus: computeLatestStatus(mergedActions),
        hasOpenActions: hasStatus(mergedActions, "open"),
        actionCount: mergedActions.length,
      },
    };
  });

  return {
    featureCollection: {
      ...fc,
      features: updatedFeatures,
    },
    maxTreeActionId,
  };
};

/**
 * Legacy function - kept for backward compatibility
 * @deprecated Use enrichFeatureCollectionWithActions instead
 */
export const enrichFeatureCollection = (fc: FeatureCollection) => {
  return {
    ...fc,
    features: fc.features.map((f) => {
      return {
        ...f,
        properties: {
          ...f.properties,
          // Add computed properties
          latestActionStatus: computeLatestStatus(f.properties.actions),
          hasOpenActions: hasStatus(f.properties.actions, "open"),
          actionCount: f.properties.actions?.length || 0,
        },
      };
    }),
  };
};

export const createInfoBoxControlObject = (
  feature: Feature,
  baseUrl: string,
  setShowStatusDialog: (show: boolean) => void
) => {
  const p = feature.properties;
  console.log("xxx feature.properties", p);
  let headerColor, header;
  switch (p.latestActionStatus) {
    case "none":
      headerColor = "#A5D6A7";
      header = "Baumbewirtschaftung";
      break;
    case "open":
      headerColor = "#FFEB3B";
      header = "Baumbewirtschaftung (in Bearbeitung)";

      break;
    case "exception":
      headerColor = "#F44336";
      header = "Baumbewirtschaftung (Ausnahme)";
      break;
    case "done":
      headerColor = "#4CAF50";
      header = "Baumbewirtschaftung (erledigt)";
      break;
    default:
      headerColor = "#A5D6A7";
      header = "Baumbewirtschaftung";
  }

  // Get the latest action's image
  let latestActionImage: string | undefined = undefined;
  if (p.actions && Array.isArray(p.actions) && p.actions.length > 0) {
    // Sort actions by action_time descending to get the most recent
    const sortedActions = [...p.actions].sort((a: any, b: any) => {
      const timeA = a.action_time ? new Date(a.action_time).getTime() : 0;
      const timeB = b.action_time ? new Date(b.action_time).getTime() : 0;
      return timeB - timeA;
    });

    const latestAction = sortedActions[0];
    if (latestAction?.payload?.pic) {
      latestActionImage = baseUrl + latestAction.payload.pic;
    }
  }

  // Collect all action photos and create captions
  const fotos: string[] = [];
  const fotoCaptions: string[] = [];

  if (p.actions && Array.isArray(p.actions)) {
    // Sort actions by action_time descending (newest first) to match the main foto
    const sortedActions = [...p.actions].sort((a: any, b: any) => {
      const timeA = a.action_time ? new Date(a.action_time).getTime() : 0;
      const timeB = b.action_time ? new Date(b.action_time).getTime() : 0;
      return timeB - timeA; // descending order (newest first)
    });

    sortedActions.forEach((action: any) => {
      if (action?.payload?.pic) {
        fotos.push(baseUrl + action.payload.pic);

        // Create caption: "30.9.2025 08:40 ▶️ Gestartet - Zugang prüfen (thelkl)"
        const date = action.action_time ? new Date(action.action_time) : null;
        const dateStr = date
          ? date.toLocaleDateString("de-DE") +
            " " +
            date.toLocaleTimeString("de-DE", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";

        const statusEmoji =
          action.status === "done"
            ? "✅"
            : action.status === "open"
            ? "▶️"
            : action.status === "exception"
            ? "⚠️"
            : "";
        const statusName =
          action.status === "done"
            ? "Abgeschlossen"
            : action.status === "open"
            ? "Gestartet"
            : action.status === "exception"
            ? "Ausnahme"
            : "";
        const statusReason = action.status_reason || "";
        const user = action.payload?.user || "";

        const caption = `${dateStr} ${statusEmoji} ${statusName} - ${statusReason} (${user})`;
        fotoCaptions.push(caption);
      }
    });
  }
  console.log("xxx fotos", latestActionImage, fotos, fotoCaptions);
  const copyright = (
    <span
      style={{
        display: "inline-block",
        width: "100%",
        textAlign: "right",
        whiteSpace: "nowrap",
      }}
    >
      <a
        href="https://www.wuppertal.de/service/impressum.php"
        target="_impressum"
      >
        <Icon name="copyright" /> Stadt Wuppertal
      </a>
    </span>
  );
  const puretitle =
    p.baumart_botanisch +
    " (" +
    p.standort_nr +
    "." +
    p.zusatz +
    "." +
    p.lfd_nr_str +
    ")";
  const ibo = {
    headerColor,
    header,
    puretitle,
    title: "<html><h3>" + puretitle + "</html>",
    // additionalInfo:
    //   " (*" +
    //   p.pflanzjahr +
    //   " / " +
    //   p.standalter_jahr +
    //   ")" +
    //   "\n\n" +
    //   p.hoehe_m +
    //   "m / " +
    //   p.stammumfang_cm +
    //   "cm",
    subtitle: p.ortlicher_bezug,
    modal: true,

    genericLinks: [
      {
        action: () => {
          setShowStatusDialog(true);
        },
        tooltip: "Status ändern",
        iconname: "tasks",
      },
    ],
    foto: latestActionImage,
    fotos: fotos.length > 0 ? fotos : undefined,
    fotoCaptions: fotoCaptions.length > 0 ? fotoCaptions : undefined,
  };
  return ibo;
};
