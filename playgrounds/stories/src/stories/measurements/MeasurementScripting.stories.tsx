import type { Meta, StoryObj } from "@storybook/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MeasurementToolbar3D } from "../../../../../libraries/commons/measurements/src";
import {
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  type PolylineSegmentLineMode,
  MeasurementMode,
} from "../../../../../libraries/mapping/engines/cesium/measurements/src/lib/types/MeasurementTypes";
import type {
  MeasurementScriptRequestEventDetail,
  MeasurementScriptResponseEventDetail,
  MeasurementScriptRpcRequest,
  MeasurementScriptRpcResponse,
  MeasurementScriptStateSnapshot,
  MeasurementScriptWindowApi,
} from "../../../../../libraries/mapping/engines/cesium/measurements/src/lib/types/MeasurementScriptApi";
import { MeasurementCesiumStoryShell } from "./shared/MeasurementCesiumStoryShell";
import {
  SPATIAL_MARKUP_KIND_AREA,
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_LABEL,
  SPATIAL_MARKUP_KIND_PLANAR,
  SPATIAL_MARKUP_KIND_POINT,
  SPATIAL_MARKUP_KIND_POLYLINE,
  SPATIAL_MARKUP_KIND_VERTICAL,
} from "../../../../../libraries/commons/measurements/src/lib/types/measurementKindRegistry";

type DemoMeasurementType =
  | typeof SPATIAL_MARKUP_KIND_POINT
  | typeof SPATIAL_MARKUP_KIND_DISTANCE
  | typeof SPATIAL_MARKUP_KIND_POLYLINE
  | typeof SPATIAL_MARKUP_KIND_AREA
  | typeof SPATIAL_MARKUP_KIND_VERTICAL
  | typeof SPATIAL_MARKUP_KIND_PLANAR
  | typeof SPATIAL_MARKUP_KIND_LABEL;

type ScriptingStoryArgs = {
  demoType: DemoMeasurementType;
  overlayWidth: number;
  autoRun: boolean;
  showStateJson: boolean;
};

const SCRIPT_NAMESPACE = "CARMA_MEASUREMENTS_SCRIPT";
const REQUEST_EVENT_NAME = "carma:measurements:script:request";
const RESPONSE_EVENT_NAME = "carma:measurements:script:response";

const BASE_LONGITUDE = 7.201578;
const BASE_LATITUDE = 51.256565;
const BASE_HEIGHT_M = 190;

const edgeId = (pointAId: string, pointBId: string) => {
  const [left, right] = [pointAId, pointBId].sort((a, b) => a.localeCompare(b));
  return `edge:${left}:${right}`;
};

const addNodeRequest = (
  id: string,
  longitudeOffsetDeg: number,
  latitudeOffsetDeg: number,
  heightOffsetM: number = 0,
  select = false
): MeasurementScriptRpcRequest => ({
  jsonrpc: "2.0",
  id: `add-node-${id}`,
  method: "measurements.add",
  params: {
    id,
    select,
    measurement: {
      kind: "node",
      payload: {
        longitude: BASE_LONGITUDE + longitudeOffsetDeg,
        latitude: BASE_LATITUDE + latitudeOffsetDeg,
        heightMeters: BASE_HEIGHT_M + heightOffsetM,
      },
    },
  },
});

const addLabelRequest = (
  id: string,
  text: string,
  longitudeOffsetDeg: number,
  latitudeOffsetDeg: number,
  heightOffsetM: number = 0
): MeasurementScriptRpcRequest => ({
  jsonrpc: "2.0",
  id: `add-label-${id}`,
  method: "measurements.add",
  params: {
    id,
    select: true,
    measurement: {
      kind: SPATIAL_MARKUP_KIND_LABEL,
      payload: {
        text,
        longitude: BASE_LONGITUDE + longitudeOffsetDeg,
        latitude: BASE_LATITUDE + latitudeOffsetDeg,
        heightMeters: BASE_HEIGHT_M + heightOffsetM,
      },
    },
  },
});

const addDistanceRelationRequest = (
  id: string,
  pointAId: string,
  pointBId: string,
  anchorPointId: string,
  polygonGroupId?: string
): MeasurementScriptRpcRequest => ({
  jsonrpc: "2.0",
  id: `add-relation-${id}`,
  method: "measurements.add",
  params: {
    measurement: {
      kind: "distanceRelation",
      payload: {
        id,
        edgeId: edgeId(pointAId, pointBId),
        pointAId,
        pointBId,
        anchorPointId,
        polygonGroupId,
        showDirectLine: true,
        showVerticalLine: true,
        showHorizontalLine: true,
        showComponentLines: false,
      },
    },
  },
});

const addPlanarPolygonGroupRequest = ({
  id,
  vertexPointIds,
  edgeRelationIds,
  closed,
  surfaceType,
  measurementKind,
  segmentLineMode,
  select,
}: {
  id: string;
  vertexPointIds: string[];
  edgeRelationIds: string[];
  closed: boolean;
  surfaceType: "roof" | "facade" | "terrain" | "footprint";
  measurementKind:
    | typeof SPATIAL_MARKUP_KIND_POLYLINE
    | typeof SPATIAL_MARKUP_KIND_AREA;
  segmentLineMode?: PolylineSegmentLineMode;
  select?: boolean;
}): MeasurementScriptRpcRequest => ({
  jsonrpc: "2.0",
  id: `add-group-${id}`,
  method: "measurements.add",
  params: {
    select,
    measurement: {
      kind: "planarPolygonGroup",
      payload: {
        id,
        closed,
        planeLocked: false,
        vertexPointIds,
        edgeRelationIds,
        surfaceType,
        measurementKind,
        segmentLineMode,
      },
    },
  },
});

const buildDemoBatchByType = (
  demoType: DemoMeasurementType
): MeasurementScriptRpcRequest[] => {
  const clearAndSetMode: MeasurementScriptRpcRequest[] = [
    {
      jsonrpc: "2.0",
      id: "clear",
      method: "measurements.clearAll",
    },
    {
      jsonrpc: "2.0",
      id: "set-mode",
      method: "measurements.setMode",
      params: {
        mode:
          demoType === SPATIAL_MARKUP_KIND_DISTANCE
            ? MeasurementMode.PointQuery
            : demoType === SPATIAL_MARKUP_KIND_POLYLINE ||
              demoType === SPATIAL_MARKUP_KIND_AREA ||
              demoType === SPATIAL_MARKUP_KIND_VERTICAL ||
              demoType === SPATIAL_MARKUP_KIND_PLANAR
            ? MeasurementMode.PolylineMeasure
            : MeasurementMode.PointMeasure,
      },
    },
  ];

  if (demoType === SPATIAL_MARKUP_KIND_POINT) {
    return [
      ...clearAndSetMode,
      addNodeRequest("demo-point-a", 0, 0, 0, true),
      addNodeRequest("demo-point-b", 0.00032, -0.00018, 4),
      addNodeRequest("demo-point-c", -0.00024, 0.00022, -2),
    ];
  }

  if (demoType === SPATIAL_MARKUP_KIND_DISTANCE) {
    return [
      ...clearAndSetMode,
      addNodeRequest("demo-distance-a", 0, 0, 0, true),
      addNodeRequest("demo-distance-b", 0.00045, 0.00008, 8),
      addNodeRequest("demo-distance-c", 0.00082, -0.00014, 3),
      addDistanceRelationRequest(
        "demo-distance-r1",
        "demo-distance-a",
        "demo-distance-b",
        "demo-distance-a"
      ),
      addDistanceRelationRequest(
        "demo-distance-r2",
        "demo-distance-b",
        "demo-distance-c",
        "demo-distance-b"
      ),
      {
        jsonrpc: "2.0",
        id: "select-distance-anchor",
        method: "measurements.select",
        params: { measurementId: "demo-distance-b" },
      },
    ];
  }

  if (demoType === SPATIAL_MARKUP_KIND_POLYLINE) {
    return [
      ...clearAndSetMode,
      addNodeRequest("demo-polyline-a", -0.0005, -0.00025, 1),
      addNodeRequest("demo-polyline-b", -0.0001, 0.00005, 5),
      addNodeRequest("demo-polyline-c", 0.00035, -0.00008, 2),
      addDistanceRelationRequest(
        "demo-polyline-r1",
        "demo-polyline-a",
        "demo-polyline-b",
        "demo-polyline-a",
        "demo-polyline-group"
      ),
      addDistanceRelationRequest(
        "demo-polyline-r2",
        "demo-polyline-b",
        "demo-polyline-c",
        "demo-polyline-b",
        "demo-polyline-group"
      ),
      addPlanarPolygonGroupRequest({
        id: "demo-polyline-group",
        closed: false,
        vertexPointIds: [
          "demo-polyline-a",
          "demo-polyline-b",
          "demo-polyline-c",
        ],
        edgeRelationIds: ["demo-polyline-r1", "demo-polyline-r2"],
        surfaceType: "facade",
        measurementKind: SPATIAL_MARKUP_KIND_POLYLINE,
        segmentLineMode: LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
        select: true,
      }),
      {
        jsonrpc: "2.0",
        id: "select-polyline-group",
        method: "measurements.select",
        params: { planarPolygonGroupId: "demo-polyline-group" },
      },
    ];
  }

  if (
    demoType === SPATIAL_MARKUP_KIND_AREA ||
    demoType === SPATIAL_MARKUP_KIND_VERTICAL ||
    demoType === SPATIAL_MARKUP_KIND_PLANAR
  ) {
    const groupId = `demo-${demoType}-group`;
    const pointAId = `demo-${demoType}-a`;
    const pointBId = `demo-${demoType}-b`;
    const pointCId = `demo-${demoType}-c`;
    const pointDId = `demo-${demoType}-d`;
    const relation1Id = `demo-${demoType}-r1`;
    const relation2Id = `demo-${demoType}-r2`;
    const relation3Id = `demo-${demoType}-r3`;
    const relation4Id = `demo-${demoType}-r4`;

    const surfaceType =
      demoType === SPATIAL_MARKUP_KIND_AREA
        ? "footprint"
        : demoType === SPATIAL_MARKUP_KIND_VERTICAL
        ? "facade"
        : "roof";

    return [
      ...clearAndSetMode,
      addNodeRequest(pointAId, -0.00055, -0.00018, 0),
      addNodeRequest(pointBId, -0.0001, -0.00011, 0),
      addNodeRequest(pointCId, -0.00008, 0.00018, 3),
      addNodeRequest(pointDId, -0.00052, 0.0001, 2),
      addDistanceRelationRequest(
        relation1Id,
        pointAId,
        pointBId,
        pointAId,
        groupId
      ),
      addDistanceRelationRequest(
        relation2Id,
        pointBId,
        pointCId,
        pointBId,
        groupId
      ),
      addDistanceRelationRequest(
        relation3Id,
        pointCId,
        pointDId,
        pointCId,
        groupId
      ),
      addDistanceRelationRequest(
        relation4Id,
        pointDId,
        pointAId,
        pointDId,
        groupId
      ),
      addPlanarPolygonGroupRequest({
        id: groupId,
        closed: true,
        vertexPointIds: [pointAId, pointBId, pointCId, pointDId],
        edgeRelationIds: [relation1Id, relation2Id, relation3Id, relation4Id],
        surfaceType,
        measurementKind: SPATIAL_MARKUP_KIND_AREA,
        segmentLineMode: LINEAR_SEGMENT_LINE_MODE_DIRECT,
        select: true,
      }),
      {
        jsonrpc: "2.0",
        id: "select-area-group",
        method: "measurements.select",
        params: { planarPolygonGroupId: groupId },
      },
    ];
  }

  return [
    ...clearAndSetMode,
    addLabelRequest("demo-label-a", "Demo Label", 0.0002, 0.00016, 5),
  ];
};

const getScriptApi = (): MeasurementScriptWindowApi | null => {
  if (typeof window === "undefined") return null;
  const candidate = (window as Record<string, unknown>)[SCRIPT_NAMESPACE];
  if (!candidate || typeof candidate !== "object") return null;
  const api = candidate as Partial<MeasurementScriptWindowApi>;
  if (typeof api.execute !== "function" || typeof api.getState !== "function") {
    return null;
  }
  return api as MeasurementScriptWindowApi;
};

const MeasurementScriptingHarness = ({
  demoType,
  overlayWidth,
  autoRun,
  showStateJson,
}: ScriptingStoryArgs) => {
  const [stateSnapshot, setStateSnapshot] =
    useState<MeasurementScriptStateSnapshot | null>(null);
  const [lastResponse, setLastResponse] = useState<
    MeasurementScriptRpcResponse | MeasurementScriptRpcResponse[] | null
  >(null);
  const [lastAction, setLastAction] = useState("Ready");
  const autoRunRef = useRef(false);

  const demoBatch = useMemo(() => buildDemoBatchByType(demoType), [demoType]);

  const refreshState = useCallback(() => {
    const api = getScriptApi();
    if (!api) return;
    try {
      const snapshot = api.getState();
      setStateSnapshot(snapshot);
    } catch (error) {
      console.warn("[STORY][MEASUREMENTS] Failed to fetch script state", error);
    }
  }, []);

  const executeBatch = useCallback(
    async (batch: MeasurementScriptRpcRequest[], actionLabel: string) => {
      const api = getScriptApi();
      if (!api) {
        setLastAction(`${actionLabel} failed: script API unavailable`);
        return;
      }
      try {
        const response = await api.execute(batch);
        setLastResponse(response);
        setLastAction(actionLabel);
        refreshState();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown script error";
        setLastAction(`${actionLabel} failed: ${message}`);
      }
    },
    [refreshState]
  );

  const executeViaEventBridge = useCallback(
    async (batch: MeasurementScriptRpcRequest[]) => {
      if (typeof window === "undefined") return;
      await new Promise<void>((resolve) => {
        const requestId = `story-event-${Date.now()}`;
        const handleResponse = (event: Event) => {
          const customEvent =
            event as CustomEvent<MeasurementScriptResponseEventDetail>;
          if (!customEvent.detail || customEvent.detail.id !== requestId) {
            return;
          }
          window.removeEventListener(RESPONSE_EVENT_NAME, handleResponse);
          setLastResponse(customEvent.detail.response);
          setLastAction(`Executed ${demoType} via event bridge`);
          refreshState();
          resolve();
        };

        window.addEventListener(RESPONSE_EVENT_NAME, handleResponse);
        window.dispatchEvent(
          new CustomEvent<MeasurementScriptRequestEventDetail>(
            REQUEST_EVENT_NAME,
            {
              detail: {
                id: requestId,
                request: batch,
              },
            }
          )
        );
      });
    },
    [demoType, refreshState]
  );

  useEffect(() => {
    refreshState();
    const timerId = window.setInterval(refreshState, 850);
    return () => {
      window.clearInterval(timerId);
    };
  }, [refreshState]);

  useEffect(() => {
    autoRunRef.current = false;
  }, [demoType]);

  useEffect(() => {
    if (!autoRun || autoRunRef.current) return;
    autoRunRef.current = true;
    executeBatch(demoBatch, `Auto-ran ${demoType} demo`);
  }, [autoRun, demoBatch, demoType, executeBatch]);

  const stateSummary = useMemo(() => {
    if (!stateSnapshot) return "state unavailable";
    return [
      `mode=${stateSnapshot.measurementMode}`,
      `measurements=${stateSnapshot.measurements.length}`,
      `distanceRelations=${stateSnapshot.distanceRelations.length}`,
      `planarGroups=${stateSnapshot.planarPolygonGroups.length}`,
      `selected=${stateSnapshot.selectedMeasurementId ?? "none"}`,
    ].join(" | ");
  }, [stateSnapshot]);

  return (
    <MeasurementCesiumStoryShell overlayWidth={overlayWidth}>
      <MeasurementToolbar3D pixelWidth={overlayWidth} />

      <div
        style={{
          marginTop: 8,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255, 255, 255, 0.35)",
          backgroundColor: "rgba(15, 23, 42, 0.78)",
          color: "#f8fafc",
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 1.45,
          display: "grid",
          gap: 8,
        }}
      >
        <div>
          <strong>Script Demo:</strong> {demoType}
        </div>
        <div>{stateSummary}</div>
        <div>lastAction: {lastAction}</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() =>
              executeBatch(
                demoBatch,
                `Executed ${demoType} demo via window API`
              )
            }
          >
            Run Script Batch
          </button>
          <button
            type="button"
            onClick={() => executeViaEventBridge(demoBatch)}
          >
            Run via Event Bridge
          </button>
          <button
            type="button"
            onClick={() =>
              executeBatch(
                [
                  {
                    jsonrpc: "2.0",
                    id: "clear",
                    method: "measurements.clearAll",
                  },
                ],
                "Cleared measurements via script"
              )
            }
          >
            Clear
          </button>
          <button type="button" onClick={refreshState}>
            Refresh State
          </button>
        </div>

        {showStateJson ? (
          <pre
            style={{
              margin: 0,
              padding: 8,
              maxHeight: 220,
              overflow: "auto",
              borderRadius: 6,
              backgroundColor: "rgba(2, 6, 23, 0.75)",
              border: "1px solid rgba(148, 163, 184, 0.35)",
            }}
          >
            {JSON.stringify(
              {
                state: stateSnapshot,
                lastResponse,
              },
              null,
              2
            )}
          </pre>
        ) : null}
      </div>
    </MeasurementCesiumStoryShell>
  );
};

const meta = {
  title: "measurements/MeasurementScripting",
  component: MeasurementScriptingHarness,
  args: {
    demoType: SPATIAL_MARKUP_KIND_POINT,
    overlayWidth: 860,
    autoRun: true,
    showStateJson: false,
  },
  argTypes: {
    demoType: {
      control: "select",
      options: [
        SPATIAL_MARKUP_KIND_POINT,
        SPATIAL_MARKUP_KIND_DISTANCE,
        SPATIAL_MARKUP_KIND_POLYLINE,
        SPATIAL_MARKUP_KIND_AREA,
        SPATIAL_MARKUP_KIND_VERTICAL,
        SPATIAL_MARKUP_KIND_PLANAR,
        SPATIAL_MARKUP_KIND_LABEL,
      ],
    },
    overlayWidth: {
      control: {
        type: "range",
        min: 420,
        max: 1200,
        step: 10,
      },
    },
    autoRun: { control: "boolean" },
    showStateJson: { control: "boolean" },
  },
} satisfies Meta<typeof MeasurementScriptingHarness>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PointDemo: Story = {
  args: { demoType: SPATIAL_MARKUP_KIND_POINT },
};

export const DistanceDemo: Story = {
  args: { demoType: SPATIAL_MARKUP_KIND_DISTANCE },
};

export const PolylineDemo: Story = {
  args: { demoType: SPATIAL_MARKUP_KIND_POLYLINE },
};

export const AreaFootprintDemo: Story = {
  args: { demoType: SPATIAL_MARKUP_KIND_AREA },
};

export const AreaFacadeDemo: Story = {
  args: { demoType: SPATIAL_MARKUP_KIND_VERTICAL },
};

export const AreaRoofDemo: Story = {
  args: { demoType: SPATIAL_MARKUP_KIND_PLANAR },
};

export const LabelDemo: Story = {
  args: { demoType: SPATIAL_MARKUP_KIND_LABEL },
};
