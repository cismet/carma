export const DEFAULT_ANNOTATION_TOOL_MESSAGES: Readonly<
  Record<string, string>
> = {
  "measurement.tool.point.label": "Punkt",
  "measurement.tool.point.tooltip": "Punkt messen",
  "measurement.tool.distance.label": "Strecke",
  "measurement.tool.distance.tooltip": "Strecke messen",
  "measurement.tool.polyline.label": "Polygonzug",
  "measurement.tool.polyline.tooltip": "Polygonzug messen",
  "measurement.tool.areaFootprint.label": "Grundriss",
  "measurement.tool.areaFootprint.tooltip": "Grundriss",
  "measurement.tool.areaPlanar.label": "Planar",
  "measurement.tool.areaPlanar.tooltip": "Planare Fläche",
  "measurement.tool.areaVertical.label": "Vertikal",
  "measurement.tool.areaVertical.tooltip": "Vertikale Fläche",
  "measurement.tool.label.label": "Anmerkung",
  "measurement.tool.label.tooltip": "Anmerkung",
  "measurement.tool.select.label": "Auswahl",
  "measurement.tool.select.tooltip": "Messung auswählen",
};

export const resolveAnnotationToolText = (
  key: string,
  dictionary: Readonly<
    Record<string, string>
  > = DEFAULT_ANNOTATION_TOOL_MESSAGES
): string => dictionary[key] ?? key;
