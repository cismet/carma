import {
  faArrowPointer,
  faBuilding,
  faLocationDot,
  faMessage,
  faRuler,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  ANNOTATION_TOOL_TYPES,
} from "@carma-mapping/annotations/core";
import { resolveAnnotationToolText } from "../../config/annotation-tool-text";
const {
  SELECT: SELECT_TOOL_TYPE,
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  LABEL: ANNOTATION_TYPE_LABEL,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  POINT: ANNOTATION_TYPE_POINT,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
} = ANNOTATION_TOOL_TYPES;

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
        labelKey: "measurement.tool.areaPlanar.label",
        tooltipKey: "measurement.tool.areaPlanar.tooltip",
      },
    },
    {
      id: ANNOTATION_TYPE_AREA_VERTICAL,
      order: 60,
      icon: <FontAwesomeIcon icon={faBuilding} />,
      i18n: {
        labelKey: "measurement.tool.areaVertical.label",
        tooltipKey: "measurement.tool.areaVertical.tooltip",
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
