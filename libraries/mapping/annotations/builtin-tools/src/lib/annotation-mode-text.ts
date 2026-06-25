import type {
  AnnotationInfoBoxActionLabels,
  AnnotationInfoBoxNavigationLabels,
} from "@carma-mapping/annotations/ui";

export type AnnotationToolDescriptorText = Readonly<{
  label: string;
  tooltip: string;
  headingTitle: string;
  helpText: readonly string[];
}>;

export type AnnotationSelectToolText = Readonly<{
  label: string;
  tooltip: string;
  helpText: readonly string[];
}>;

export type AnnotationPointToolText = AnnotationToolDescriptorText &
  Readonly<{
    elevationLabels: {
      absolutePrefix: string;
      relativeHeightSuffix: string;
      missingReference: string;
    };
  }>;

export type AnnotationDistanceToolText = AnnotationToolDescriptorText &
  Readonly<{
    metricLabels: {
      direct: string;
      horizontal: string;
      vertical: string;
    };
  }>;

export type AnnotationPolylineToolText = AnnotationToolDescriptorText &
  Readonly<{
    metricLabels: {
      totalLength: string;
      segmentCount: string;
      meanSegmentLength: string;
      ascent: string;
      descent: string;
      absoluteElevationChange: string;
      startEndElevationDelta: string;
      bearing: string;
    };
  }>;

export type AnnotationAreaToolText = AnnotationToolDescriptorText &
  Readonly<{
    metricLabels: {
      perimeter: string;
      verticality: string;
      bearing: string;
    };
  }>;

export type AnnotationVerticalAreaToolText = AnnotationToolDescriptorText &
  Readonly<{
    contentLabels: {
      bearingPrefix: string;
    };
  }>;

export type AnnotationLabelToolText = AnnotationToolDescriptorText &
  Readonly<{
    defaultDisplayNamePrefix: string;
    infoBoxLabels: {
      fontSize: string;
      decreaseFontSizeAriaLabel: string;
      increaseFontSizeAriaLabel: string;
      backgroundColor: string;
      backgroundColorAriaLabel: string;
      textColor: string;
      textColorAriaLabel: string;
    };
  }>;

export type DefaultAnnotationToolTexts = Readonly<{
  actions: AnnotationInfoBoxActionLabels;
  navigation: AnnotationInfoBoxNavigationLabels;
  select: AnnotationSelectToolText;
  point: AnnotationPointToolText;
  distance: AnnotationDistanceToolText;
  polyline: AnnotationPolylineToolText;
  areaGround: AnnotationAreaToolText;
  areaPlanar: AnnotationAreaToolText;
  verticalArea: AnnotationVerticalAreaToolText;
  label: AnnotationLabelToolText;
}>;

export type AnnotationModeLabelTextModalText = Readonly<{
  title: string;
  okText: string;
  cancelText: string;
  inputAriaLabel: string;
  inputPlaceholder: string;
  suggestionButtonSize: "small" | "middle" | "large";
}>;

export type AnnotationModeText = Readonly<{
  layerTitle: {
    empty: string;
    singular: string;
    plural: string;
  };
  secondaryInfoBoxHeader: string;
  labelTextModal: AnnotationModeLabelTextModalText;
  layerbar: {
    cesiumAnnotations: {
      focusAll: string;
      exportAllGeoJson: string;
      deleteAll: string;
    };
    leafletMeasurements: {
      focusAll: string;
      save: string;
      deleteAll: string;
    };
    adhocModel: {
      actions: {
        close: string;
        focusObject: string;
        toggleClipping: string;
      };
      highlight: {
        activate: string;
        deactivate: string;
      };
      clipping: {
        label: string;
        off: string;
        on: string;
      };
      renderStyleLabels: {
        default: string;
        highlight: string;
      };
      tintLabel: string;
      tintSwatches: {
        yellow: string;
        blue: string;
        green: string;
        orange: string;
      };
      modelPositionFields: {
        lon: string;
        lat: string;
        height: string;
        heading: string;
      };
    };
  };
  annotationTools: DefaultAnnotationToolTexts;
}>;

type DeepPartial<T> = T extends readonly string[]
  ? readonly string[]
  : T extends object
  ? {
      [K in keyof T]?: DeepPartial<T[K]>;
    }
  : T;

export type AnnotationModeTextOverrides = DeepPartial<AnnotationModeText>;

export const defaultAnnotationToolTexts = {
  actions: {
    flyTo: "Zur Messung fliegen",
    exportGeoJson: "Als GeoJSON exportieren",
    show: "Einblenden",
    hide: "Ausblenden",
    setReference: "Als Referenzhöhe setzen",
    lock: "Sperren",
    unlock: "Entsperren",
    editStyle: "Darstellung bearbeiten",
    delete: "Löschen",
    deleteLocked: "Gesperrte Messung kann nicht gelöscht werden",
  },
  navigation: {
    entrySingular: "Messung",
    entryPlural: "Messungen",
    availableSuffix: "verfügbar",
    previousAriaLabel: "Vorherige Messung",
    nextAriaLabel: "Nächste Messung",
    counterSeparator: "von",
  },
  select: {
    label: "Auswahl",
    tooltip: "Messung auswählen",
    helpText: ["Messungen oder Anmerkungen anklicken, um sie auszuwählen."],
  },
  point: {
    label: "Punktmessung",
    tooltip: "Punkt messen",
    headingTitle: "Punktmessung",
    helpText: [
      "Klick auf eine Position in der Karte setzt dort eine Punktmessung.",
      "Jeder weitere Klick erstellt sofort eine neue Punktmessung.",
    ],
    elevationLabels: {
      absolutePrefix: "NHN",
      relativeHeightSuffix: "relative Höhe über Bezugspunkt",
      missingReference: "Keine Referenzhöhe gesetzt.",
    },
  },
  distance: {
    label: "Distanzmessung",
    tooltip: "Distanz messen",
    headingTitle: "Distanzmessung",
    helpText: [
      "Zwei Positionen in der Karte anklicken, um eine Distanzmessung zu erstellen.",
    ],
    metricLabels: {
      direct: "Direkt",
      horizontal: "Horizontal",
      vertical: "Vertikal",
    },
  },
  polyline: {
    label: "Polygonzug",
    tooltip: "Polygonzug messen",
    headingTitle: "Polygonzug",
    helpText: [
      "Punkte nacheinander setzen, um einen Polygonzug zu erstellen.",
      "Doppelklick schliesst die Messung ab, Escape verwirft den Entwurf.",
    ],
    metricLabels: {
      totalLength: "Gesamtlänge",
      segmentCount: "Segmente",
      meanSegmentLength: "Ø Segment",
      ascent: "Aufstieg",
      descent: "Abstieg",
      absoluteElevationChange: "Summe H",
      startEndElevationDelta: "Δ Start/Ende",
      bearing: "Ausrichtung",
    },
  },
  areaGround: {
    label: "Grundriss",
    tooltip: "Grundriss messen",
    headingTitle: "Grundriss",
    helpText: [
      "Punkte nacheinander setzen, um einen Grundriss zu erstellen.",
      "Doppelklick schliesst die Fläche ab, Escape verwirft den Entwurf.",
    ],
    metricLabels: {
      perimeter: "Umfang",
      verticality: "Vertikalität",
      bearing: "Ausrichtung",
    },
  },
  areaPlanar: {
    label: "Dach",
    tooltip: "Dachfläche messen",
    headingTitle: "Plane Fläche (Dachfläche)",
    helpText: [
      "Punkte nacheinander setzen, um eine Dachfläche zu erstellen.",
      "Doppelklick schliesst die Fläche ab, Escape verwirft den Entwurf.",
    ],
    metricLabels: {
      perimeter: "Umfang",
      verticality: "Vertikalität",
      bearing: "Ausrichtung",
    },
  },
  verticalArea: {
    label: "Vertikal",
    tooltip: "Vertikale Fläche messen",
    headingTitle: "Vertikale Fläche",
    helpText: [
      "Ersten Eckpunkt klicken, dann den diagonal gegenüberliegenden Eckpunkt setzen.",
      "Die Runtime erstellt daraus direkt ein echtes vertikales Rechteck.",
    ],
    contentLabels: {
      bearingPrefix: "Ausrichtung",
    },
  },
  label: {
    label: "Beschriftung",
    tooltip: "Beschriftung platzieren",
    headingTitle: "Beschriftung",
    defaultDisplayNamePrefix: "Beschriftung",
    helpText: [
      "Klicken, um eine Beschriftung zu platzieren.",
      "Aussehen und Text koennen danach direkt im Info-Panel angepasst werden.",
    ],
    infoBoxLabels: {
      fontSize: "Schriftgröße:",
      decreaseFontSizeAriaLabel: "Schriftgröße verkleinern",
      increaseFontSizeAriaLabel: "Schriftgröße vergrößern",
      backgroundColor: "Hintergrund:",
      backgroundColorAriaLabel: "Hintergrundfarbe",
      textColor: "Text:",
      textColorAriaLabel: "Textfarbe",
    },
  },
} as const satisfies DefaultAnnotationToolTexts;

export const defaultAnnotationModeText = {
  layerTitle: {
    empty: "Messung",
    singular: "Messung",
    plural: "Messungen",
  },
  secondaryInfoBoxHeader: "Messungen",
  labelTextModal: {
    title: "Beschriftung hinzufügen",
    okText: "Hinzufügen",
    cancelText: "Abbrechen",
    inputAriaLabel: "Text der Beschriftung",
    inputPlaceholder: "Text der Beschriftung",
    suggestionButtonSize: "small",
  },
  layerbar: {
    cesiumAnnotations: {
      focusAll: "Alle Messungen anzeigen",
      exportAllGeoJson: "Alle Messungen speichern",
      deleteAll: "Alle Messungen löschen",
    },
    leafletMeasurements: {
      focusAll: "Alle Messungen anzeigen",
      save: "Alle Messungen speichern",
      deleteAll: "Alle Messungen löschen",
    },
    adhocModel: {
      actions: {
        close: "Schließen",
        focusObject: "Objekt fokussieren",
        toggleClipping: "Clipping umschalten",
      },
      highlight: {
        activate: "Akzentuiert darstellen",
        deactivate: "Realistisch darstellen",
      },
      clipping: {
        label: "Clipping",
        off: "Aus",
        on: "An",
      },
      renderStyleLabels: {
        default: "Normal",
        highlight: "Highlight",
      },
      tintLabel: "Tönung",
      tintSwatches: {
        yellow: "Gelb",
        blue: "Blau",
        green: "Grün",
        orange: "Orange",
      },
      modelPositionFields: {
        lon: "Lon",
        lat: "Lat",
        height: "Höhe",
        heading: "Drehung",
      },
    },
  },
  annotationTools: defaultAnnotationToolTexts,
} as const satisfies AnnotationModeText;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mergeTextOverrides = <T>(base: T, overrides?: DeepPartial<T>): T => {
  if (overrides === undefined) {
    return base;
  }

  if (!isRecord(base) || !isRecord(overrides)) {
    return overrides as T;
  }

  const merged: Record<string, unknown> = { ...base };
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    const baseValue = (base as Record<string, unknown>)[key];
    merged[key] =
      isRecord(baseValue) && isRecord(value)
        ? mergeTextOverrides(baseValue, value)
        : value;
  });

  return merged as T;
};

export const resolveAnnotationModeText = (
  overrides?: AnnotationModeTextOverrides
): AnnotationModeText =>
  mergeTextOverrides<AnnotationModeText>(defaultAnnotationModeText, overrides);
