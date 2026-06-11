import { type ComponentProps, type PropsWithChildren } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

import mappingReducer from "../../store/slices/mapping";
import uiReducer from "../../store/slices/ui";
import {
  CESIUM_ANNOTATION_LAYER_ID,
  CESIUM_ANNOTATION_SAVE_INTERACTION_ID,
} from "../annotations/cesium-annotations.constants";
import GeoportalLayerButtonSlot from "./GeoportalLayerButtonSlot";
import type GeoportalLayerButton from "./GeoportalLayerButton";

const useAnnotationsRuntimeMock = vi.hoisted(() => vi.fn());
const exportAllAnnotationsGeoJsonMock = vi.hoisted(() => vi.fn());
const flyToAnnotationIdsMock = vi.hoisted(() => vi.fn());
const annotationEntryRolesMock = vi.hoisted(() => ({
  AUTHORING: "authoring",
  EXTERNAL: "external",
}));

vi.mock("@carma-mapping/annotations/runtime", () => ({
  ANNOTATION_ENTRY_ROLES: annotationEntryRolesMock,
  ANNOTATION_DELETE_CONFIRMATION_SOURCES: {
    UI: "ui",
  },
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID: "carma-3d-annotations-geojson",
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION: 1,
  flyToAnnotationIds: flyToAnnotationIdsMock,
  selectAuthoringAnnotationEntries: ({
    annotationEntries,
  }: {
    annotationEntries: Array<{ annotationRole?: string }>;
  }) =>
    annotationEntries.filter(
      (annotationEntry) =>
        annotationEntry.annotationRole !== annotationEntryRolesMock.EXTERNAL
    ),
  resolveAnnotationsRuntimePersistenceFromGeoJson: (value: unknown) => {
    const candidate = value as {
      metadata?: {
        carmaConf?: {
          annotationsRuntimePersistence?: unknown;
        };
      };
      features?: Array<{
        properties?: {
          carmaConf?: {
            annotationRuntime?: {
              annotation?: unknown;
              nodes?: unknown[];
              linkedNodeGroups?: unknown[];
              edges?: unknown[];
            };
          };
        };
      }>;
    };
    const metadataPersistence =
      candidate.metadata?.carmaConf?.annotationsRuntimePersistence;
    if (metadataPersistence) {
      return metadataPersistence;
    }

    const annotationRuntime =
      candidate.features?.[0]?.properties?.carmaConf?.annotationRuntime;
    if (!annotationRuntime?.annotation) {
      return null;
    }

    return {
      formatId: "annotations-runtime-persistence",
      version: 1,
      tables: {
        annotationEntries: [annotationRuntime.annotation],
        nodes: annotationRuntime.nodes ?? [],
        linkedNodeGroups: annotationRuntime.linkedNodeGroups ?? [],
        edges: annotationRuntime.edges ?? [],
      },
      settings: {
        elevationReferenceAnnotationId: null,
        lastActiveToolType: null,
        nextShortLabelCounterByToolType: {},
      },
    };
  },
  useAnnotationsRuntime: () => useAnnotationsRuntimeMock(),
}));

vi.mock("@carma-commons/measurements", () => ({
  useMapMeasurementsContext: () => ({
    shapes: [],
    clearAllShapes: vi.fn(),
  }),
}));

vi.mock("./GeoportalLayerButton", () => ({
  default: ({
    actionSlot,
    title,
  }: ComponentProps<typeof GeoportalLayerButton>) => (
    <div>
      <span>{title}</span>
      {actionSlot}
    </div>
  ),
}));

vi.mock("./AdhocModelLayerbarControls", () => ({
  AdhocModelFlyToLayerbarAction: () => (
    <button type="button">Adhoc fly-to</button>
  ),
  AdhocModelLayerbarActions: () => (
    <button type="button">Adhoc model actions</button>
  ),
}));

const createTestStore = () =>
  configureStore({
    reducer: {
      mapping: mappingReducer,
      ui: uiReducer,
    },
  });

const createWrapper =
  (store = createTestStore()) =>
  ({ children }: PropsWithChildren) =>
    <Provider store={store}>{children}</Provider>;

describe("GeoportalLayerButtonSlot", () => {
  beforeEach(() => {
    useAnnotationsRuntimeMock.mockReset();
    exportAllAnnotationsGeoJsonMock.mockReset();
    flyToAnnotationIdsMock.mockReset();
    useAnnotationsRuntimeMock.mockReturnValue({
      annotationEntries: [{ id: "annotation-1" }],
      appendAnnotationsRuntimePersistenceState: vi.fn(),
      exportAllAnnotationsGeoJson: exportAllAnnotationsGeoJsonMock,
      flyToAllAnnotations: vi.fn(),
      nodes: [],
      removeExternalAnnotationsByCollection: vi.fn(),
      removeAnnotationsByIds: vi.fn(),
      scene: null,
    });
  });

  it("renders consolidated Cesium annotation layerbar action labels and save icon", () => {
    const store = createTestStore();

    render(
      <GeoportalLayerButtonSlot
        id={CESIUM_ANNOTATION_LAYER_ID}
        index={0}
        title="Messung"
        layer={{
          id: CESIUM_ANNOTATION_LAYER_ID,
          title: "Messung",
          type: "object",
          icon: "measurement",
          visible: true,
        }}
      />,
      { wrapper: createWrapper(store) }
    );

    expect(
      (
        screen.getByRole("button", {
          name: "Alle Messungen anzeigen",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);

    const saveButton = screen.getByRole("button", {
      name: "Alle Messungen speichern",
    });

    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    expect(
      within(saveButton)
        .getByRole("img", { hidden: true })
        .getAttribute("data-icon")
    ).toBe("floppy-disk");

    fireEvent.click(saveButton);

    expect(exportAllAnnotationsGeoJsonMock).not.toHaveBeenCalled();
    expect(store.getState().mapping.activeInteractionLayerID).toBe(
      CESIUM_ANNOTATION_LAYER_ID
    );
    expect(store.getState().mapping.activeInteractionButtonID).toBe(
      CESIUM_ANNOTATION_SAVE_INTERACTION_ID
    );
  });

  it("keeps saved measurement object layers external in the layerbar", () => {
    render(
      <GeoportalLayerButtonSlot
        id="measurement-3d-abc"
        index={0}
        title="Gespeicherte Messung"
        layer={{
          id: "measurement-3d-abc",
          title: "Gespeicherte Messung",
          type: "object",
          visible: true,
          layerType: "vector",
          props: {
            style: {},
          },
          other: {
            serviceName: "measurements",
          },
        }}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Adhoc fly-to")).toBeTruthy();
    expect(screen.queryByText("Adhoc model actions")).toBeNull();
  });

  it("renders saved 3D measurements from the annotation runtime payload", () => {
    const appendAnnotationsRuntimePersistenceState = vi.fn();
    const removeExternalAnnotationsByCollection = vi.fn();
    useAnnotationsRuntimeMock.mockReturnValue({
      annotationEntries: [
        {
          id: "measurement-3d-abc:distance-1",
          annotationRole: annotationEntryRolesMock.EXTERNAL,
          readOnly: true,
          externalCollection: {
            type: "saved-measurement",
            id: "measurement-3d-abc",
          },
        },
      ],
      appendAnnotationsRuntimePersistenceState,
      exportAllAnnotationsGeoJson: exportAllAnnotationsGeoJsonMock,
      flyToAllAnnotations: vi.fn(),
      nodes: [],
      removeExternalAnnotationsByCollection,
      removeAnnotationsByIds: vi.fn(),
      scene: null,
    });

    render(
      <GeoportalLayerButtonSlot
        id="measurement-3d-abc"
        index={0}
        title="Gespeicherte 3D-Messung"
        layer={{
          id: "measurement-3d-abc",
          title: "Gespeicherte 3D-Messung",
          type: "object",
          visible: true,
          layerType: "vector",
          props: {
            style: {
              metadata: {
                carmaConf: {
                  annotationsGeoJson: {
                    type: "FeatureCollection",
                    features: [],
                    metadata: {
                      carmaConf: {
                        formatId: "carma-3d-annotations-geojson",
                        formatVersion: 1,
                        source: "geoportal-cesium-annotations",
                        annotationsRuntimePersistence: {
                          formatId: "annotations-runtime-persistence",
                          version: 1,
                          tables: {
                            annotationEntries: [
                              {
                                id: "distance-1",
                                toolType: "distance",
                                nodeIds: ["node-1", "node-2"],
                                edgeIds: ["edge-1"],
                              },
                            ],
                            nodes: [],
                            linkedNodeGroups: [],
                            edges: [],
                          },
                          settings: {
                            elevationReferenceAnnotationId: null,
                            lastActiveToolType: null,
                            nextShortLabelCounterByToolType: {},
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          other: {
            serviceName: "measurements",
          },
        }}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByText("Adhoc fly-to")).toBeNull();
    expect(screen.queryByText("Adhoc model actions")).toBeNull();
    // Registration ownership lives in the annotation provider; the layerbar
    // button only reads the already-registered external entries.
    expect(appendAnnotationsRuntimePersistenceState).not.toHaveBeenCalled();
    expect(removeExternalAnnotationsByCollection).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Objekt fokussieren" }));

    expect(flyToAnnotationIdsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        annotationIds: ["measurement-3d-abc:distance-1"],
      })
    );
  });

  it("detects saved 3D measurements from feature properties after metadata-only loss", () => {
    const appendAnnotationsRuntimePersistenceState = vi.fn();
    useAnnotationsRuntimeMock.mockReturnValue({
      annotationEntries: [
        {
          id: "measurement-3d-abc:distance-1",
          annotationRole: annotationEntryRolesMock.EXTERNAL,
          readOnly: true,
          externalCollection: {
            type: "saved-measurement",
            id: "measurement-3d-abc",
          },
        },
      ],
      appendAnnotationsRuntimePersistenceState,
      exportAllAnnotationsGeoJson: exportAllAnnotationsGeoJsonMock,
      flyToAllAnnotations: vi.fn(),
      nodes: [],
      removeExternalAnnotationsByCollection: vi.fn(),
      removeAnnotationsByIds: vi.fn(),
      scene: null,
    });

    render(
      <GeoportalLayerButtonSlot
        id="measurement-3d-abc"
        index={0}
        title="Gespeicherte 3D-Messung"
        layer={{
          id: "measurement-3d-abc",
          title: "Gespeicherte 3D-Messung",
          type: "object",
          visible: true,
          layerType: "vector",
          props: {
            style: {
              sources: {
                adhoc: {
                  type: "geojson",
                  data: {
                    type: "FeatureCollection",
                    features: [
                      {
                        type: "Feature",
                        id: "distance-1",
                        geometry: {
                          type: "LineString",
                          coordinates: [
                            [7, 51, 100],
                            [7.1, 51.1, 130],
                          ],
                        },
                        properties: {
                          carmaConf: {
                            annotationRuntime: {
                              formatId: "carma-3d-annotation-runtime-feature",
                              formatVersion: 1,
                              annotation: {
                                id: "distance-1",
                                toolType: "distance",
                                nodeIds: ["node-1", "node-2"],
                                edgeIds: ["edge-1"],
                              },
                              nodes: [
                                {
                                  id: "node-1",
                                  coordinate: {
                                    longitude: 7,
                                    latitude: 51,
                                    altitude: 100,
                                  },
                                },
                                {
                                  id: "node-2",
                                  coordinate: {
                                    longitude: 7.1,
                                    latitude: 51.1,
                                    altitude: 130,
                                  },
                                },
                              ],
                              linkedNodeGroups: [],
                              edges: [
                                {
                                  id: "edge-1",
                                  startNodeId: "node-1",
                                  endNodeId: "node-2",
                                },
                              ],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
          other: {
            serviceName: "measurements",
          },
        }}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByText("Adhoc fly-to")).toBeNull();
    expect(screen.queryByText("Adhoc model actions")).toBeNull();
    // Detection from feature properties keeps the saved-measurement button
    // variant; registration itself stays with the annotation provider.
    expect(appendAnnotationsRuntimePersistenceState).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Objekt fokussieren" }));

    expect(flyToAnnotationIdsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        annotationIds: ["measurement-3d-abc:distance-1"],
      })
    );
  });

  it("keeps model actions for non-measurement object layers", () => {
    render(
      <GeoportalLayerButtonSlot
        id="adhoc-object"
        index={0}
        title="Adhoc Objekt"
        layer={{
          id: "adhoc-object",
          title: "Adhoc Objekt",
          type: "object",
          visible: true,
          layerType: "vector",
          props: {
            style: {},
          },
          other: {
            serviceName: "favoriteObjects",
          },
        }}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Adhoc fly-to")).toBeTruthy();
    expect(screen.getByText("Adhoc model actions")).toBeTruthy();
  });
});
