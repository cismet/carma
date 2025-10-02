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
  };
}

interface Action {
  status: string;
}

export const computeLatestStatus = (actions?: Action[]) => {
  if (!actions || actions.length === 0) return "none";
  return actions[0]?.status || "none";
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
  const ibo = {
    headerColor: "#7AB317",
    header: "Baumbewirtschaftung",
    title:
      p.baumart_botanisch +
      " (" +
      p.standort_nr +
      "." +
      p.zusatz +
      "." +
      p.lfd_nr_str +
      ")",
    additionalInfo:
      " (*" +
      p.pflanzjahr +
      " / " +
      p.standalter_jahr +
      ")" +
      "\n\n" +
      p.hoehe_m +
      "m / " +
      p.stammumfang_cm +
      "cm",
    subtitle: p.ortlicher_bezug,
    modal: true,
    // url: "https://cismet.de",
    // email: "info@cismet.de",
    // tel: "01709120394",
    genericLinks: [
      {
        action: () => {
          setShowStatusDialog(true);
        },
        tooltip: "Status ändern",
        iconname: "tasks",
      },
    ],
    foto: baseUrl + "/demo/mod" + (feature.id % 10) + ".png",
    //fotos: [of urls]
    //if there are more than one foto need to be there anyway
  };
  return ibo;
};
