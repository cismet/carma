import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowPointer,
  faBuilding,
  faLocationDot,
  faMessage,
  faRuler,
} from "@fortawesome/free-solid-svg-icons";
import {
  VectorPolylineIcon,
  VectorSquareIcon,
  VectorTrapezoidIcon,
  createToolManager,
  type ToolDescriptor,
  type ToolManager,
} from "@carma-commons/ui/components";
import {
  type AnnotationToolType,
  SELECT_TOOL_TYPE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_VERTICAL,
} from "../types/annotationTypes";

export type AnnotationToolManagerContext = {
  modeActive?: boolean;
};

export type AnnotationToolDescriptor = ToolDescriptor<
  AnnotationToolType,
  AnnotationToolManagerContext
>;

export type AnnotationToolManager = ToolManager<
  AnnotationToolType,
  AnnotationToolManagerContext
>;

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
  "measurement.tool.areaRoof.label": "Dach",
  "measurement.tool.areaRoof.tooltip": "Dachfläche",
  "measurement.tool.areaFacade.label": "Fassade",
  "measurement.tool.areaFacade.tooltip": "Fassadenfläche",
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

export const defaultAnnotationToolDescriptors: readonly AnnotationToolDescriptor[] =
  [
    {
      id: ANNOTATION_TYPE_POINT,
      order: 10,
      icon: <FontAwesomeIcon icon={faLocationDot} />,
      i18n: {
        labelKey: "measurement.tool.point.label",
        tooltipKey: "measurement.tool.point.tooltip",
      },
    },
    {
      id: ANNOTATION_TYPE_DISTANCE,
      order: 20,
      icon: <FontAwesomeIcon icon={faRuler} />,
      i18n: {
        labelKey: "measurement.tool.distance.label",
        tooltipKey: "measurement.tool.distance.tooltip",
      },
    },
    {
      id: ANNOTATION_TYPE_POLYLINE,
      order: 30,
      icon: <VectorPolylineIcon fontSize="1.33em" />,
      i18n: {
        labelKey: "measurement.tool.polyline.label",
        tooltipKey: "measurement.tool.polyline.tooltip",
      },
    },
    {
      id: ANNOTATION_TYPE_AREA_GROUND,
      order: 40,
      icon: <VectorSquareIcon fontSize="1.33em" />,
      i18n: {
        labelKey: "measurement.tool.areaFootprint.label",
        tooltipKey: "measurement.tool.areaFootprint.tooltip",
      },
    },
    {
      id: ANNOTATION_TYPE_AREA_PLANAR,
      order: 50,
      icon: <VectorTrapezoidIcon fontSize="1.33em" />,
      i18n: {
        labelKey: "measurement.tool.areaRoof.label",
        tooltipKey: "measurement.tool.areaRoof.tooltip",
      },
    },
    {
      id: ANNOTATION_TYPE_AREA_VERTICAL,
      order: 60,
      icon: <FontAwesomeIcon icon={faBuilding} />,
      i18n: {
        labelKey: "measurement.tool.areaFacade.label",
        tooltipKey: "measurement.tool.areaFacade.tooltip",
      },
    },
    {
      id: ANNOTATION_TYPE_LABEL,
      order: 70,
      icon: <FontAwesomeIcon icon={faMessage} />,
      i18n: {
        labelKey: "measurement.tool.label.label",
        tooltipKey: "measurement.tool.label.tooltip",
      },
    },
    {
      id: SELECT_TOOL_TYPE,
      order: 100,
      icon: <FontAwesomeIcon icon={faArrowPointer} />,
      i18n: {
        labelKey: "measurement.tool.select.label",
        tooltipKey: "measurement.tool.select.tooltip",
      },
    },
  ];

export const createAnnotationToolManager = (
  descriptors: readonly AnnotationToolDescriptor[] = defaultAnnotationToolDescriptors
): AnnotationToolManager => createToolManager(descriptors);

export const annotationToolManager = createAnnotationToolManager();
