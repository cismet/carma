import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState, type ReactNode } from "react";

import type { MeasurementToolType } from "../../../../../libraries/commons/measurements/src/lib/tools/measurementToolTypes";
import {
  defaultMeasurementToolDescriptors,
  resolveMeasurementToolText,
} from "../../../../../libraries/commons/measurements/src/lib/tools/measurementToolManager";
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
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  type PolylineSegmentLineMode,
} from "../../../../../libraries/commons/measurements/src/lib/types/measurementTypes";
import {
  createToolManager,
  type ToolDescriptor,
} from "../../../../../libraries/commons/ui/components/src";
import { MeasurementCesiumStoryShell } from "./shared/MeasurementCesiumStoryShell";

type ToolManagerStoryArgs = {
  width: number;
  singleToolId?: MeasurementToolType;
};

type ToolState = {
  selectAdditiveMode: boolean;
  selectRectangleMode: boolean;
  pointSoloMode: boolean;
  pointVerticalOffsetMeters: number;
  distanceStickyToFirstPoint: boolean;
  polylineSegmentLineMode: PolylineSegmentLineMode;
  polylineVerticalOffsetMeters: number;
};

type ToolOptionContext = {
  state: ToolState;
  update: (patch: Partial<ToolState>) => void;
};

type StoryToolDescriptor = ToolDescriptor<
  MeasurementToolType,
  ToolOptionContext
>;

const HELP_TEXT_BY_TOOL: Record<MeasurementToolType, string[]> = {
  [SPATIAL_MARKUP_KIND_POINT]: [
    "Klick setzt eine Punktmessung am Gelände.",
    "Temporär/Solo und Vertikalversatz sind pro Tool einstellbar.",
  ],
  [SPATIAL_MARKUP_KIND_DISTANCE]: [
    "Erster Klick setzt Start, zweiter Klick Ziel.",
    "Optional kann jede Folgemessung am Referenzpunkt starten.",
  ],
  [SPATIAL_MARKUP_KIND_POLYLINE]: [
    "Klick setzt Stützpunkte, Doppelklick beendet.",
    "Segmentdarstellung kann zwischen Direkt und Komponenten wechseln.",
  ],
  [SPATIAL_MARKUP_KIND_AREA]: [
    "Polygonpunkte werden auf dem Boden gesetzt.",
    "Nur die Flächengeometrie und Labeldarstellung sind aktiv.",
  ],
  [SPATIAL_MARKUP_KIND_PLANAR]: [
    "Punkte definieren eine planare Dachfläche.",
    "Dachmodus nutzt planare Projektionslogik.",
  ],
  [SPATIAL_MARKUP_KIND_VERTICAL]: [
    "Fassadenflächen richten sich an vertikalen Ebenen aus.",
    "Gegenüberliegende Kanten können zusammengeführt dargestellt werden.",
  ],
  [SPATIAL_MARKUP_KIND_LABEL]: [
    "Klick erzeugt ein freies Label.",
    "Text und Stil werden in der 3D-Infobox bearbeitet.",
  ],
  [SELECT_TOOL_TYPE]: [
    "Klick selektiert ohne Seiteneffekte.",
    "Additiv und Rechteckauswahl sind optional aktivierbar.",
  ],
};

const TOOL_OPTIONS_BY_TOOL: Partial<
  Record<MeasurementToolType, (ctx: ToolOptionContext) => ReactNode>
> = {
  [SPATIAL_MARKUP_KIND_POINT]: ({ state, update }) => (
    <>
      <label>
        <input
          type="checkbox"
          checked={state.pointSoloMode}
          onChange={(event) =>
            update({ pointSoloMode: event.currentTarget.checked })
          }
        />{" "}
        Temporär/Solo
      </label>
      <label>
        Vertikalversatz (m):{" "}
        <input
          type="number"
          step={0.5}
          value={state.pointVerticalOffsetMeters}
          onChange={(event) =>
            update({
              pointVerticalOffsetMeters: Number(event.currentTarget.value) || 0,
            })
          }
          style={{ width: 78 }}
        />
      </label>
    </>
  ),
  [SPATIAL_MARKUP_KIND_DISTANCE]: ({ state, update }) => (
    <label>
      <input
        type="checkbox"
        checked={state.distanceStickyToFirstPoint}
        onChange={(event) =>
          update({ distanceStickyToFirstPoint: event.currentTarget.checked })
        }
      />{" "}
      An Referenzpunkt starten
    </label>
  ),
  [SPATIAL_MARKUP_KIND_POLYLINE]: ({ state, update }) => (
    <>
      <label>
        Segmentdarstellung:{" "}
        <select
          value={state.polylineSegmentLineMode}
          onChange={(event) =>
            update({
              polylineSegmentLineMode: event.currentTarget
                .value as ToolState["polylineSegmentLineMode"],
            })
          }
        >
          <option value={LINEAR_SEGMENT_LINE_MODE_DIRECT}>Direkt</option>
          <option value={LINEAR_SEGMENT_LINE_MODE_COMPONENTS}>
            Komponenten
          </option>
        </select>
      </label>
      <label>
        Vertikalversatz (m):{" "}
        <input
          type="number"
          step={0.5}
          value={state.polylineVerticalOffsetMeters}
          onChange={(event) =>
            update({
              polylineVerticalOffsetMeters:
                Number(event.currentTarget.value) || 0,
            })
          }
          style={{ width: 78 }}
        />
      </label>
    </>
  ),
  [SPATIAL_MARKUP_KIND_AREA]: () => <span>Flächenmodus: Grundriss</span>,
  [SPATIAL_MARKUP_KIND_PLANAR]: () => <span>Flächenmodus: Dach</span>,
  [SPATIAL_MARKUP_KIND_VERTICAL]: () => <span>Flächenmodus: Fassade</span>,
  [SPATIAL_MARKUP_KIND_LABEL]: () => <span>Anmerkungsmodus aktiv</span>,
  [SELECT_TOOL_TYPE]: ({ state, update }) => (
    <>
      <label>
        <input
          type="checkbox"
          checked={state.selectAdditiveMode}
          onChange={(event) =>
            update({ selectAdditiveMode: event.currentTarget.checked })
          }
        />{" "}
        Additiv
      </label>
      <label>
        <input
          type="checkbox"
          checked={state.selectRectangleMode}
          onChange={(event) =>
            update({ selectRectangleMode: event.currentTarget.checked })
          }
        />{" "}
        Rechteckauswahl
      </label>
    </>
  ),
};

const TOOL_BUTTON_STYLE = (active: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: 8,
  border: active ? "1px solid rgba(22, 119, 255, 0.5)" : "1px solid #d1d5db",
  backgroundColor: active ? "#ffffff" : "#f9fafb",
  color: active ? "#1677ff" : "#4b5563",
  cursor: "pointer",
  boxShadow: active
    ? "0 1px 2px rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)"
    : "none",
  fontSize: 14,
  transition: "all 0.15s ease",
});

const TOOLBOX_SURFACE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  padding: "6px",
  borderRadius: 6,
  backgroundColor: "rgba(245, 245, 245, 0.9)",
};

const HELP_BOX: React.CSSProperties = {
  marginTop: 8,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  backgroundColor: "#fff",
  fontSize: 12,
  lineHeight: 1.45,
};

const OPTIONS_BOX: React.CSSProperties = {
  marginTop: 8,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  backgroundColor: "#fff",
  fontSize: 12,
};

const buildToolDescriptors = (): StoryToolDescriptor[] =>
  defaultMeasurementToolDescriptors.map((descriptor) => ({
    id: descriptor.id,
    order: descriptor.order,
    icon: descriptor.icon,
    i18n: {
      ...descriptor.i18n,
      helpTextKeys: HELP_TEXT_BY_TOOL[descriptor.id],
    },
    createSecondaryOptions: TOOL_OPTIONS_BY_TOOL[descriptor.id],
  }));

const MeasurementToolManagerHarness = ({
  width,
  singleToolId,
}: ToolManagerStoryArgs) => {
  const manager = useMemo(
    () =>
      createToolManager<MeasurementToolType, ToolOptionContext>(
        buildToolDescriptors()
      ),
    []
  );
  const [activeToolType, setActiveToolType] = useState<MeasurementToolType>(
    singleToolId ?? SPATIAL_MARKUP_KIND_POINT
  );
  const [toolState, setToolState] = useState<ToolState>({
    selectAdditiveMode: false,
    selectRectangleMode: false,
    pointSoloMode: false,
    pointVerticalOffsetMeters: 0,
    distanceStickyToFirstPoint: false,
    polylineSegmentLineMode: LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
    polylineVerticalOffsetMeters: 0,
  });

  const optionContext: ToolOptionContext = {
    state: toolState,
    update: (patch) => setToolState((prev) => ({ ...prev, ...patch })),
  };

  const tools = manager.listTools(optionContext, singleToolId);
  const activeDescriptor =
    singleToolId !== undefined
      ? manager.getTool(singleToolId, optionContext)
      : manager.getTool(activeToolType, optionContext);

  if (!activeDescriptor) {
    return null;
  }

  return (
    <div style={{ width, padding: 12, backgroundColor: "#f3f4f6" }}>
      <div style={TOOLBOX_SURFACE}>
        {tools.map((tool) => {
          const isActive = activeDescriptor.id === tool.id;
          const tooltip = resolveMeasurementToolText(tool.i18n.tooltipKey);
          return (
            <button
              key={tool.id}
              type="button"
              title={tooltip}
              aria-label={tooltip}
              style={TOOL_BUTTON_STYLE(isActive)}
              onClick={() => setActiveToolType(tool.id)}
            >
              {tool.icon}
            </button>
          );
        })}
      </div>

      <div style={HELP_BOX}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {resolveMeasurementToolText(activeDescriptor.i18n.labelKey)}
        </div>
        {(activeDescriptor.i18n.helpTextKeys ?? []).map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>

      <div style={OPTIONS_BOX}>
        {activeDescriptor.createSecondaryOptions?.(optionContext) ?? null}
      </div>
    </div>
  );
};

const meta = {
  title: "measurements/MeasurementToolManager",
  component: MeasurementToolManagerHarness,
  decorators: [
    (Story) => (
      <MeasurementCesiumStoryShell overlayWidth={920}>
        <Story />
      </MeasurementCesiumStoryShell>
    ),
  ],
  args: {
    width: 820,
  },
  argTypes: {
    width: {
      control: {
        type: "range",
        min: 360,
        max: 1400,
        step: 10,
      },
    },
    singleToolId: {
      control: false,
    },
  },
} satisfies Meta<typeof MeasurementToolManagerHarness>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  args: {
    singleToolId: undefined,
  },
};

export const SelectToolOnly: Story = {
  args: {
    singleToolId: SELECT_TOOL_TYPE,
  },
};

export const PointToolOnly: Story = {
  args: {
    singleToolId: SPATIAL_MARKUP_KIND_POINT,
  },
};

export const DistanceToolOnly: Story = {
  args: {
    singleToolId: SPATIAL_MARKUP_KIND_DISTANCE,
  },
};

export const PolylineToolOnly: Story = {
  args: {
    singleToolId: SPATIAL_MARKUP_KIND_POLYLINE,
  },
};

export const AreaFootprintToolOnly: Story = {
  args: {
    singleToolId: SPATIAL_MARKUP_KIND_AREA,
  },
};

export const AreaFacadeToolOnly: Story = {
  args: {
    singleToolId: SPATIAL_MARKUP_KIND_VERTICAL,
  },
};

export const AreaRoofToolOnly: Story = {
  args: {
    singleToolId: SPATIAL_MARKUP_KIND_PLANAR,
  },
};

export const LabelToolOnly: Story = {
  args: {
    singleToolId: SPATIAL_MARKUP_KIND_LABEL,
  },
};
