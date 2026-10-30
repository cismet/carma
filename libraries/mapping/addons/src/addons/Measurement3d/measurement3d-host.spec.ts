import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  registerMeasurement3dHostUi,
  setMeasurement3dPanelHost,
  setMeasurement3dRuntimeServices,
  useMeasurement3dHostUi,
  useMeasurement3dPanelHost,
  useMeasurement3dRuntimeServices,
  type Measurement3dHostUi,
  type Measurement3dRuntimeServices,
} from "./measurement3d-host";

describe("measurement3d host stores", () => {
  afterEach(() => {
    setMeasurement3dPanelHost(null);
    setMeasurement3dRuntimeServices(null);
  });

  it("publishes the panel element to the toolbar", () => {
    const { result } = renderHook(() => useMeasurement3dPanelHost());
    const element = document.createElement("div");

    expect(result.current).toBeNull();
    act(() => setMeasurement3dPanelHost(element));
    expect(result.current).toBe(element);
  });

  it("publishes the runtime services while the runtime is mounted", () => {
    const { result } = renderHook(() => useMeasurement3dRuntimeServices());
    const services = {} as Measurement3dRuntimeServices;

    act(() => setMeasurement3dRuntimeServices(services));
    expect(result.current).toBe(services);
    act(() => setMeasurement3dRuntimeServices(null));
    expect(result.current).toBeNull();
  });

  describe("host UI", () => {
    const first: Measurement3dHostUi = { confirmDelete: () => true };
    const second: Measurement3dHostUi = { confirmDelete: () => false };

    it("is the plain addon UI until a host registers", () => {
      const { result } = renderHook(() => useMeasurement3dHostUi());

      expect(result.current).toBeNull();
      let unregister = () => undefined;
      act(() => {
        unregister = registerMeasurement3dHostUi(first);
      });
      expect(result.current).toBe(first);
      act(() => unregister());
      expect(result.current).toBeNull();
    });

    it("keeps a remounted host's registration when the old instance cleans up late", () => {
      const { result } = renderHook(() => useMeasurement3dHostUi());
      let unregisterFirst = () => undefined;
      let unregisterSecond = () => undefined;

      act(() => {
        unregisterFirst = registerMeasurement3dHostUi(first);
        unregisterSecond = registerMeasurement3dHostUi(second);
        unregisterFirst();
      });
      expect(result.current).toBe(second);
      act(() => unregisterSecond());
      expect(result.current).toBeNull();
    });
  });
});
