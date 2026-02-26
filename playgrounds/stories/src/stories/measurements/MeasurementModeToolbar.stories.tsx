import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";

import {
  MeasurementModeToolbar,
  type MeasurementModeToolbarProps,
  type MeasurementToolType,
} from "../../../../../libraries/commons/measurements/src/lib/components/MeasurementModeToolbar";
import {
  SELECT_TOOL_TYPE,
  SPATIAL_MARKUP_KIND_AREA,
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_LABEL,
  SPATIAL_MARKUP_KIND_PLANAR,
  SPATIAL_MARKUP_KIND_POINT,
  SPATIAL_MARKUP_KIND_POLYLINE,
  SPATIAL_MARKUP_KIND_VERTICAL,
} from "../../../../../libraries/commons/measurements/src/lib/types/measurementKindRegistry";
import {
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  type PolylineSegmentLineMode,
} from "../../../../../libraries/commons/measurements/src/lib/types/measurementTypes";
import { MeasurementCesiumStoryShell } from "./shared/MeasurementCesiumStoryShell";

type ToolbarStoryArgs = {
  initialToolType: MeasurementToolType;
  lockToolType: boolean;
  pixelWidth: number;
  selectedMeasurementCount: number;
  selectedLabelCount: number;
  hasDeletableSelection: boolean;
  selectedVisibilityHidden: boolean;
  selectedLocked: boolean;
};

const TOOL_MODE_LIST: MeasurementToolType[] = [
  SELECT_TOOL_TYPE,
  SPATIAL_MARKUP_KIND_POINT,
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_POLYLINE,
  SPATIAL_MARKUP_KIND_AREA,
  SPATIAL_MARKUP_KIND_VERTICAL,
  SPATIAL_MARKUP_KIND_PLANAR,
  SPATIAL_MARKUP_KIND_LABEL,
];

const MeasurementModeToolbarStoryHarness = ({
  initialToolType,
  lockToolType,
  pixelWidth,
  selectedMeasurementCount,
  selectedLabelCount,
  hasDeletableSelection,
  selectedVisibilityHidden,
  selectedLocked,
}: ToolbarStoryArgs) => {
  const [activeToolType, setActiveToolType] =
    useState<MeasurementToolType>(initialToolType);
  const [selectAdditiveMode, setSelectAdditiveMode] = useState(false);
  const [selectRectangleMode, setSelectRectangleMode] = useState(false);
  const [distanceStickyToFirstPoint, setDistanceStickyToFirstPoint] =
    useState(false);
  const [distanceLineVisibility, setDistanceLineVisibility] = useState({
    direct: true,
    vertical: true,
    horizontal: true,
  });
  const [pointVerticalOffsetMeters, setPointVerticalOffsetMeters] = useState(0);
  const [polylineVerticalOffsetMeters, setPolylineVerticalOffsetMeters] =
    useState(0);
  const [polylineSegmentLineMode, setPolylineSegmentLineMode] =
    useState<PolylineSegmentLineMode>(LINEAR_SEGMENT_LINE_MODE_COMPONENTS);
  const [pointSoloMode, setPointSoloMode] = useState(false);
  const [selectionHidden, setSelectionHidden] = useState(
    selectedVisibilityHidden
  );
  const [selectionLocked, setSelectionLocked] = useState(selectedLocked);

  const props: MeasurementModeToolbarProps = useMemo(
    () => ({
      activeToolType,
      onToolTypeChange: (nextToolType) => {
        if (lockToolType) return;
        setActiveToolType(nextToolType);
      },
      selectAdditiveMode,
      onSelectAdditiveModeChange: setSelectAdditiveMode,
      selectRectangleMode,
      onSelectRectangleModeChange: setSelectRectangleMode,
      selectedMeasurementCount,
      selectedLabelCount,
      onDeleteSelectedPoints: () => undefined,
      onToggleSelectedVisibility: () => {
        setSelectionHidden((prev) => !prev);
      },
      onToggleSelectedLock: () => {
        setSelectionLocked((prev) => !prev);
      },
      selectedVisibilityHidden: selectionHidden,
      selectedLocked: selectionLocked,
      hasDeletableSelection,
      distanceLineVisibility,
      onDistanceLineVisibilityChange: (kind, visible) => {
        setDistanceLineVisibility((prev) => ({ ...prev, [kind]: visible }));
      },
      distanceStickyToFirstPoint,
      onDistanceStickyToFirstPointChange: setDistanceStickyToFirstPoint,
      pointVerticalOffsetMeters,
      onPointVerticalOffsetChange: setPointVerticalOffsetMeters,
      polylineVerticalOffsetMeters,
      onPolylineVerticalOffsetChange: setPolylineVerticalOffsetMeters,
      polylineSegmentLineMode,
      onPolylineSegmentLineModeChange: setPolylineSegmentLineMode,
      pointSoloMode,
      onPointSoloModeChange: setPointSoloMode,
      pixelWidth,
    }),
    [
      activeToolType,
      distanceLineVisibility,
      distanceStickyToFirstPoint,
      hasDeletableSelection,
      lockToolType,
      pixelWidth,
      pointSoloMode,
      pointVerticalOffsetMeters,
      polylineSegmentLineMode,
      polylineVerticalOffsetMeters,
      selectAdditiveMode,
      selectRectangleMode,
      selectedLabelCount,
      selectedMeasurementCount,
      selectionHidden,
      selectionLocked,
    ]
  );

  return (
    <div
      style={{
        width: pixelWidth,
        minHeight: 170,
        padding: 12,
        backgroundColor: "#f3f4f6",
      }}
    >
      <MeasurementModeToolbar {...props} />
      <div
        style={{
          marginTop: 10,
          fontSize: 12,
          color: "#4b5563",
          fontFamily: "sans-serif",
        }}
      >
        Active mode: <code>{activeToolType}</code>
        {lockToolType ? " (locked for this story)" : " (interactive)"}
      </div>
    </div>
  );
};

const meta = {
  title: "measurements/MeasurementModeToolbar",
  component: MeasurementModeToolbarStoryHarness,
  decorators: [
    (Story) => (
      <MeasurementCesiumStoryShell overlayWidth={900}>
        <Story />
      </MeasurementCesiumStoryShell>
    ),
  ],
  args: {
    initialToolType: SPATIAL_MARKUP_KIND_POINT,
    lockToolType: true,
    pixelWidth: 700,
    selectedMeasurementCount: 3,
    selectedLabelCount: 1,
    hasDeletableSelection: true,
    selectedVisibilityHidden: false,
    selectedLocked: false,
  },
  argTypes: {
    initialToolType: {
      control: "select",
      options: TOOL_MODE_LIST,
    },
    lockToolType: {
      control: "boolean",
    },
    pixelWidth: {
      control: {
        type: "range",
        min: 320,
        max: 1200,
        step: 10,
      },
    },
    selectedMeasurementCount: {
      control: {
        type: "number",
        min: 0,
        max: 100,
      },
    },
    selectedLabelCount: {
      control: {
        type: "number",
        min: 0,
        max: 100,
      },
    },
    hasDeletableSelection: {
      control: "boolean",
    },
    selectedVisibilityHidden: {
      control: "boolean",
    },
    selectedLocked: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof MeasurementModeToolbarStoryHarness>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InteractiveOverview: Story = {
  args: {
    initialToolType: SPATIAL_MARKUP_KIND_POINT,
    lockToolType: false,
  },
};

export const SelectMode: Story = {
  args: {
    initialToolType: SELECT_TOOL_TYPE,
    lockToolType: true,
  },
};

export const PointMode: Story = {
  args: {
    initialToolType: SPATIAL_MARKUP_KIND_POINT,
    lockToolType: true,
  },
};

export const DistanceMode: Story = {
  args: {
    initialToolType: SPATIAL_MARKUP_KIND_DISTANCE,
    lockToolType: true,
  },
};

export const PolylineMode: Story = {
  args: {
    initialToolType: SPATIAL_MARKUP_KIND_POLYLINE,
    lockToolType: true,
  },
};

export const AreaFootprintMode: Story = {
  args: {
    initialToolType: SPATIAL_MARKUP_KIND_AREA,
    lockToolType: true,
  },
};

export const AreaFacadeMode: Story = {
  args: {
    initialToolType: SPATIAL_MARKUP_KIND_VERTICAL,
    lockToolType: true,
  },
};

export const AreaRoofMode: Story = {
  args: {
    initialToolType: SPATIAL_MARKUP_KIND_PLANAR,
    lockToolType: true,
  },
};

export const LabelMode: Story = {
  args: {
    initialToolType: SPATIAL_MARKUP_KIND_LABEL,
    lockToolType: true,
  },
};
