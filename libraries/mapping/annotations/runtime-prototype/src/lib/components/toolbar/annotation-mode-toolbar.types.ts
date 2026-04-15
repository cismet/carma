import type { CSSProperties } from "react";

import type {
  AnnotationToolType,
  LinearSegmentLineMode,
} from "@carma-mapping/annotations/core";

import type {
  AnnotationToolManager,
  AnnotationToolManagerContext,
} from "./annotation-tool-manager";
export type AnnotationToolbarLayoutProps = {
  showPrimaryToolbar?: boolean;
  showSecondaryToolbar?: boolean;
  pixelWidth?: number;
  secondaryToolbarContainerStyle?: CSSProperties;
  secondaryToolbarCollapsedByDefault?: boolean;
  secondaryToolbarDirection?: "down" | "right";
};

export type AnnotationToolbarSelectionProps = {
  additiveMode?: boolean;
  onAdditiveModeChange?: (enabled: boolean) => void;
  rectangleMode?: boolean;
  onRectangleModeChange?: (enabled: boolean) => void;
  selectedMeasurementCount?: number;
  selectedLabelCount?: number;
  hasAnyAnnotations?: boolean;
  hasDeletableSelection?: boolean;
  selectedVisibilityHidden?: boolean;
  selectedLocked?: boolean;
  onClearAll?: () => void;
  onDeleteSelected?: () => void;
  onToggleSelectedVisibility?: () => void;
  onToggleSelectedLock?: () => void;
};

export type AnnotationToolbarDistanceProps = {
  lineVisibility?: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  onLineVisibilityChange?: (
    kind: "direct" | "vertical" | "horizontal",
    visible: boolean
  ) => void;
  stickyToFirstPoint?: boolean;
  onStickyToFirstPointChange?: (enabled: boolean) => void;
};

export type AnnotationToolbarPointProps = {
  verticalOffsetMeters?: number;
  onVerticalOffsetChange?: (offsetMeters: number) => void;
  soloMode?: boolean;
  onSoloModeChange?: (enabled: boolean) => void;
};

export type AnnotationToolbarPolylineProps = {
  verticalOffsetMeters?: number;
  onVerticalOffsetChange?: (offsetMeters: number) => void;
  segmentLineMode?: LinearSegmentLineMode;
  onSegmentLineModeChange?: (mode: LinearSegmentLineMode) => void;
};

export type AnnotationToolbarToolCatalogProps = {
  manager?: AnnotationToolManager;
  managerContext?: AnnotationToolManagerContext;
};

export interface AnnotationModeToolbarProps {
  activeToolType: AnnotationToolType;
  onToolTypeChange: (toolType: AnnotationToolType) => void;
  layout?: AnnotationToolbarLayoutProps;
  selection?: AnnotationToolbarSelectionProps;
  distance?: AnnotationToolbarDistanceProps;
  point?: AnnotationToolbarPointProps;
  polyline?: AnnotationToolbarPolylineProps;
  toolCatalog?: AnnotationToolbarToolCatalogProps;
}
