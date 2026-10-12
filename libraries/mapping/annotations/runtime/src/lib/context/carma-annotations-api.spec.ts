import { renderHook } from "@testing-library/react";
import { carma, registerConfig, registerMapping } from "@carma-api";

import { createAnnotationToolDraftStore } from "../interaction/lifecycle/create-annotation-tool-draft-store";
import type { AnnotationToolRegistry } from "../registry";
import {
  appendAnnotationEntities,
  createAnnotationsStore,
  createInitialAnnotationsStoreState,
  setAnnotationToolType,
  setSelectedAnnotationIds,
  type AnnotationGeographicCoordinate,
  type AnnotationsStore,
} from "../store";
import {
  createCarmaAnnotationsApiAdapter,
  useCarmaAnnotationsApi,
  type CarmaAnnotationsApiServices,
} from "./carma-annotations-api";

const closedPrompt = {
  open: false,
  initialValue: "",
  onFinish: () => undefined,
  onAbort: () => undefined,
};

const at = (longitude: number): AnnotationGeographicCoordinate => ({
  longitude,
  latitude: 51.27,
  altitude: 155,
});

/**
 * A runtime cut down to what the adapter calls: a real store and draft
 * store, a distance tool that commits on its second node and an area tool
 * that commits on finish, the way the built-in tools do.
 */
const createFakeRuntime = () => {
  const annotationsStore: AnnotationsStore = createAnnotationsStore(
    createInitialAnnotationsStoreState()
  );
  const drafts = createAnnotationToolDraftStore();
  const toolIds = ["select", "point", "distance", "area", "label"];
  let counter = 0;
  const commit = (
    toolType: "point" | "distance" | "area" | "label",
    displayName?: string
  ) => {
    const coordinates = drafts.get(toolType).coordinates;
    counter += 1;
    const nodes = coordinates.map((coordinate, index) => ({
      id: `m${counter}-n${index}`,
      coordinate,
    }));
    annotationsStore.dispatch(
      appendAnnotationEntities({
        annotationEntry: {
          id: `m${counter}`,
          toolType,
          nodeIds: nodes.map((node) => node.id),
          edgeIds: [],
          shortLabel: String(counter),
          displayName,
        } as never,
        nodes,
        linkedNodeGroups: [],
        edges: [],
      })
    );
    drafts.clear(toolType);
  };
  const finishCalls: string[] = [];
  const services: CarmaAnnotationsApiServices = {
    engine: null,
    registry: {
      orderedDescriptors: toolIds.map((id) => ({ id })),
      getPlugin: (id: string) => (toolIds.includes(id) ? {} : undefined),
    } as unknown as AnnotationToolRegistry,
    annotationsStore,
    annotationToolDraftStore: drafts,
    requestModeChange: (toolId) => {
      if (
        annotationsStore.getState().annotationToolType === "area" &&
        drafts.get("area").coordinates.length >= 3
      ) {
        commit("area");
      }
      annotationsStore.dispatch(setAnnotationToolType(toolId));
    },
    requestFinishMeasurement: () => {
      const tool = annotationsStore.getState().annotationToolType;
      finishCalls.push(tool);
      if (tool !== "area" || drafts.get("area").coordinates.length < 3) {
        return false;
      }
      commit("area");
      return true;
    },
    requestPointAt: (coordinate) => {
      const tool = annotationsStore.getState().annotationToolType;
      if (tool === "label") {
        // the label tool asks for its text before it adds the label
        drafts.set("label", {
          coordinates: [coordinate],
          linkedNodeGroupIds: [null],
        });
        const close = () => {
          services.labelTextDialogState = closedPrompt;
        };
        services.labelTextDialogState = {
          open: true,
          initialValue: "Beschriftung 1",
          onFinish: (text) => {
            close();
            void Promise.resolve().then(() => commit("label", text));
          },
          onAbort: () => {
            close();
            drafts.clear("label");
          },
        };
        return true;
      }
      if (tool !== "point" && tool !== "distance" && tool !== "area") {
        return false;
      }
      const draft = drafts.get(tool);
      drafts.set(tool, {
        coordinates: [...draft.coordinates, coordinate],
        linkedNodeGroupIds: [...draft.linkedNodeGroupIds, null],
      });
      const needed = tool === "point" ? 1 : tool === "distance" ? 2 : Infinity;
      if (drafts.get(tool).coordinates.length >= needed) commit(tool);
      return true;
    },
    appendAnnotationsRuntimePersistenceState: () => [],
    removeAnnotationsByIds: () => undefined,
    buildAllAnnotationsGeoJson: () => ({ type: "FeatureCollection" }),
    setSelectedAnnotationIds: (ids) =>
      annotationsStore.dispatch(setSelectedAnnotationIds([...ids])),
    flyToAllAnnotations: () => undefined,
    labelTextDialogState: closedPrompt,
  };
  return { services, annotationsStore, drafts, finishCalls };
};

describe("createCarmaAnnotationsApiAdapter", () => {
  it("reports tools, the active tool, the draft and the measurements", async () => {
    const { services } = createFakeRuntime();
    const api = createCarmaAnnotationsApiAdapter(() => services);
    expect(api.getState()).toMatchObject({
      activeTool: "select",
      tools: ["select", "point", "distance", "area", "label"],
      draft: null,
      textPrompt: null,
      annotations: [],
    });
    await api.activateTool("area");
    await api.pickAt(at(7.1));
    expect(api.getState().draft).toEqual({ tool: "area", nodeCount: 1 });
  });

  it("switches tools and refuses one the runtime does not offer", async () => {
    const { services, annotationsStore } = createFakeRuntime();
    const api = createCarmaAnnotationsApiAdapter(() => services);
    await expect(api.activateTool("vertical")).resolves.toBe(false);
    await expect(api.activateTool("distance")).resolves.toBe(true);
    expect(annotationsStore.getState().annotationToolType).toBe("distance");
  });

  it("creates a distance from two clicks without finishing it", async () => {
    const { services, finishCalls } = createFakeRuntime();
    const api = createCarmaAnnotationsApiAdapter(() => services);
    const id = await api.createMeasurement("distance", [at(7.1), at(7.2)]);
    expect(id).toBe("m1");
    expect(finishCalls).toEqual([]);
    expect(api.getState()).toMatchObject({
      selectedIds: ["m1"],
      annotations: [{ id: "m1", type: "distance", nodeCount: 2 }],
    });
  });

  it("finishes an area once all its corners are clicked", async () => {
    const { services, finishCalls } = createFakeRuntime();
    const api = createCarmaAnnotationsApiAdapter(() => services);
    const id = await api.createMeasurement(
      "area",
      [at(7.1), at(7.2), at(7.3), at(7.4)],
      { select: false }
    );
    expect(id).toBe("m1");
    expect(finishCalls).toEqual(["area"]);
    expect(api.getState()).toMatchObject({
      selectedIds: [],
      annotations: [{ id: "m1", type: "area", nodeCount: 4 }],
    });
  });

  it("returns the requested measurement after a tool switch completes an existing draft", async () => {
    const { services, drafts } = createFakeRuntime();
    const api = createCarmaAnnotationsApiAdapter(() => services);
    await api.activateTool("area");
    for (const coordinate of [at(7.1), at(7.2), at(7.3)])
      await api.pickAt(coordinate);
    const id = await api.createMeasurement("distance", [at(7.4), at(7.5)]);
    expect(id).toBe("m2");
    expect(api.getState()).toMatchObject({
      selectedIds: ["m2"],
      annotations: [
        { id: "m1", type: "area", nodeCount: 3 },
        { id: "m2", type: "distance", nodeCount: 2 },
      ],
    });
    expect(drafts.get("distance").coordinates).toHaveLength(0);
  });

  it("starts from a clean draft and gives up when the tool takes no clicks", async () => {
    const { services, drafts } = createFakeRuntime();
    const api = createCarmaAnnotationsApiAdapter(() => services);
    drafts.set("distance", {
      coordinates: [at(7.9)],
      linkedNodeGroupIds: [null],
    });
    expect(await api.createMeasurement("distance", [at(7.1), at(7.2)])).toBe(
      "m1"
    );
    expect(await api.createMeasurement("select", [at(7.1)])).toBeNull();
  });

  it("answers a label's text prompt with the given or the proposed text", async () => {
    const { services, annotationsStore } = createFakeRuntime();
    const api = createCarmaAnnotationsApiAdapter(() => services);
    const named = await api.createMeasurement("label", [at(7.1)], {
      text: "Rathaus Barmen",
    });
    const proposed = await api.createMeasurement("label", [at(7.2)]);
    const names = annotationsStore
      .getState()
      .annotationEntries.map((entry) => [entry.id, entry.displayName]);
    expect(names).toEqual([
      [named, "Rathaus Barmen"],
      [proposed, "Beschriftung 1"],
    ]);
  });

  it("leaves an open text prompt to answer step by step", async () => {
    const { services } = createFakeRuntime();
    const api = createCarmaAnnotationsApiAdapter(() => services);
    expect(api.answerTextPrompt("x")).toBe(false);
    await api.activateTool("label");
    await api.pickAt(at(7.1));
    expect(api.getState().textPrompt).toBe("Beschriftung 1");
    expect(api.answerTextPrompt(null)).toBe(true);
    expect(api.getState()).toMatchObject({ textPrompt: null, annotations: [] });
  });

  it("drops the draft on cancel", async () => {
    const { services } = createFakeRuntime();
    const api = createCarmaAnnotationsApiAdapter(() => services);
    await api.activateTool("area");
    await api.pickAt(at(7.1));
    api.cancel();
    expect(api.getState().draft).toBeNull();
  });

  it("adds nothing from something that is not a measurement export", () => {
    const { services } = createFakeRuntime();
    const api = createCarmaAnnotationsApiAdapter(() => services);
    expect(
      api.addMeasurements({ type: "FeatureCollection", features: [] })
    ).toEqual([]);
    expect(api.addMeasurements(null)).toEqual([]);
  });
});

describe("useCarmaAnnotationsApi", () => {
  it("leaves registered config and map adapters intact across annotation runtime mounts", async () => {
    const applyById = vi.fn().mockResolvedValue(true);
    const flyTo2D = vi.fn();
    registerConfig({ applyById });
    registerMapping({
      getMode: () => "2d",
      setMode: () => undefined,
      getPosition2D: () => null,
      getCameraPosition3D: () => null,
      flyTo2D,
    });
    const configFacade = carma.config;
    const mappingFacade = carma.mapping2D;
    const { services } = createFakeRuntime();
    const hook = renderHook(() => useCarmaAnnotationsApi(services, true));
    try {
      await expect(carma.config.applyById("existing-config")).resolves.toBe(
        true
      );
      carma.mapping2D.flyTo(51, 7, 18);
      hook.unmount();
      await expect(
        carma.config.applyById("existing-config-again")
      ).resolves.toBe(true);
      carma.mapping2D.flyTo(52, 8, 19);
      expect(carma.config).toBe(configFacade);
      expect(carma.mapping2D).toBe(mappingFacade);
      expect(carma.mapping.getMode()).toBe("2d");
      expect(applyById.mock.calls).toEqual([
        ["existing-config"],
        ["existing-config-again"],
      ]);
      expect(flyTo2D.mock.calls).toEqual([
        [51, 7, 18],
        [52, 8, 19],
      ]);
    } finally {
      hook.unmount();
      registerConfig(null);
      registerMapping(null);
    }
  });

  it("answers carma.annotations while mounted, the latest runtime first", () => {
    const first = createFakeRuntime();
    const second = createFakeRuntime();
    second.annotationsStore.dispatch(setAnnotationToolType("area"));
    expect(carma.annotations.isAvailable()).toBe(false);

    const firstHook = renderHook(() =>
      useCarmaAnnotationsApi(first.services, true)
    );
    expect(carma.annotations.getState()?.activeTool).toBe("select");

    const secondHook = renderHook(() =>
      useCarmaAnnotationsApi(second.services, true)
    );
    expect(carma.annotations.getState()?.activeTool).toBe("area");

    secondHook.unmount();
    expect(carma.annotations.getState()?.activeTool).toBe("select");
    firstHook.unmount();
    expect(carma.annotations.isAvailable()).toBe(false);
    expect(carma.annotations.getState()).toBeNull();
  });

  it("stays off while disabled", () => {
    const { services } = createFakeRuntime();
    const hook = renderHook(() => useCarmaAnnotationsApi(services, false));
    expect(carma.annotations.isAvailable()).toBe(false);
    hook.unmount();
  });
});
