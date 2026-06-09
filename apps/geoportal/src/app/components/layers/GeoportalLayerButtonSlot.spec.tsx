import { type ComponentProps, type PropsWithChildren } from "react";

import { render, screen, within } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

import mappingReducer from "../../store/slices/mapping";
import uiReducer from "../../store/slices/ui";
import { CESIUM_ANNOTATION_LAYER_ID } from "../annotations/cesium-annotations.constants";
import GeoportalLayerButtonSlot from "./GeoportalLayerButtonSlot";
import type GeoportalLayerButton from "./GeoportalLayerButton";

const useAnnotationsRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock("@carma-mapping/annotations/runtime", () => ({
  ANNOTATION_DELETE_CONFIRMATION_SOURCES: {
    UI: "ui",
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
  AdhocModelFlyToLayerbarAction: () => null,
  AdhocModelLayerbarActions: () => null,
}));

const createWrapper =
  () =>
  ({ children }: PropsWithChildren) =>
    (
      <Provider
        store={configureStore({
          reducer: {
            mapping: mappingReducer,
            ui: uiReducer,
          },
        })}
      >
        {children}
      </Provider>
    );

describe("GeoportalLayerButtonSlot", () => {
  beforeEach(() => {
    useAnnotationsRuntimeMock.mockReset();
    useAnnotationsRuntimeMock.mockReturnValue({
      annotationEntries: [{ id: "annotation-1" }],
      exportAllAnnotationsGeoJson: vi.fn(),
      flyToAllAnnotations: vi.fn(),
      removeAnnotationsByIds: vi.fn(),
    });
  });

  it("renders consolidated Cesium annotation layerbar action labels and save icon", () => {
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
      { wrapper: createWrapper() }
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
  });
});
