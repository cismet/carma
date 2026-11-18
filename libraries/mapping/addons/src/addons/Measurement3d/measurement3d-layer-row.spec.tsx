import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isOn: false,
  available: false,
  endMode: vi.fn(),
}));
vi.mock("./measurement3d-state", () => ({
  useMeasurement3dActions: () => ({
    isOn: state.isOn,
    available: state.available,
    count: 0,
    endMode: state.endMode,
    setPanelOpen: () => undefined,
  }),
}));

import {
  MEASUREMENT3D_LAYER_ID,
  useMeasurement3dLayerRow,
} from "./measurement3d-layer-row";

const onAdd = vi.fn();
const onRemove = vi.fn();

const renderRow = (hasRow: boolean) =>
  renderHook(
    (props: { hasRow: boolean }) =>
      useMeasurement3dLayerRow({
        hasRow: props.hasRow,
        panelOpen: false,
        onAdd,
        onRemove,
      }),
    { initialProps: { hasRow } }
  );

describe("useMeasurement3dLayerRow", () => {
  beforeEach(() => {
    state.isOn = false;
    state.available = false;
    state.endMode.mockClear();
    onAdd.mockClear();
    onRemove.mockClear();
  });

  it("adds no row for a mode that is on without a surface", () => {
    state.isOn = true;
    renderRow(false);
    expect(onAdd).not.toHaveBeenCalled();
    expect(state.endMode).not.toHaveBeenCalled();
  });

  it("adds the row once the map can host the mode", () => {
    state.isOn = true;
    const row = renderRow(false);
    state.available = true;
    row.rerender({ hasRow: false });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toMatchObject({
      id: MEASUREMENT3D_LAYER_ID,
    });
  });

  it("removes the row and keeps the mode when the surface goes", () => {
    state.isOn = true;
    state.available = true;
    const row = renderRow(true);
    state.available = false;
    row.rerender({ hasRow: true });
    expect(onRemove).toHaveBeenCalledWith(MEASUREMENT3D_LAYER_ID);
    row.rerender({ hasRow: false });
    expect(state.endMode).not.toHaveBeenCalled();
    state.available = true;
    row.rerender({ hasRow: false });
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("removes a row left over from a mode that cannot run yet", () => {
    state.isOn = true;
    renderRow(true);
    expect(onRemove).toHaveBeenCalledWith(MEASUREMENT3D_LAYER_ID);
    expect(state.endMode).not.toHaveBeenCalled();
  });

  it("ends the mode when the host closes the row", () => {
    state.isOn = true;
    state.available = true;
    const row = renderRow(true);
    row.rerender({ hasRow: false });
    expect(state.endMode).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("removes the row when the mode is switched off", () => {
    state.isOn = true;
    state.available = true;
    const row = renderRow(true);
    state.isOn = false;
    row.rerender({ hasRow: true });
    expect(onRemove).toHaveBeenCalledWith(MEASUREMENT3D_LAYER_ID);
    expect(state.endMode).not.toHaveBeenCalled();
  });
});
