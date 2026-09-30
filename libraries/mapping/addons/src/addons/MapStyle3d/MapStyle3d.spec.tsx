import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { acquire, leases } = vi.hoisted(() => ({
  acquire: vi.fn(),
  leases: [] as Array<{
    setPointLabelOverlayVisible: ReturnType<typeof vi.fn>;
    setMapStyleElevationVisibility: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: acquire,
}));

import type { AddonComponentProps } from "../../lib/registry";
import { MapStyle3d } from ".";

const propsFor = (
  libreMap: AddonComponentProps<"mapStyle3d">["libreMap"],
  config?: AddonComponentProps<"mapStyle3d">["config"]
) => ({ libreMap, config } as AddonComponentProps<"mapStyle3d">);

afterEach(() => {
  cleanup();
  leases.length = 0;
  vi.resetAllMocks();
});

describe("MapStyle3d", () => {
  it("attaches only when the map exists and releases its own presentation", () => {
    acquire.mockImplementation(() => {
      const lease = {
        setPointLabelOverlayVisible: vi.fn(),
        setMapStyleElevationVisibility: vi.fn(),
        release: vi.fn(),
      };
      leases.push(lease);
      return lease;
    });
    const map = {} as NonNullable<
      AddonComponentProps<"mapStyle3d">["libreMap"]
    >;
    const view = render(<MapStyle3d {...propsFor(null)} />);
    expect(acquire).not.toHaveBeenCalled();
    view.rerender(<MapStyle3d {...propsFor(map)} />);
    expect(acquire).toHaveBeenLastCalledWith(map, {
      mapStylePresentation: true,
    });
    expect(leases[0].setPointLabelOverlayVisible).toHaveBeenCalledWith(true);
    expect(leases[0].setMapStyleElevationVisibility).toHaveBeenCalledWith(
      false,
      false
    );
    view.rerender(
      <MapStyle3d
        {...propsFor(map, { pointLabels: false, elevationLines: true })}
      />
    );
    expect(leases[0].release).toHaveBeenCalledOnce();
    expect(leases[1].setPointLabelOverlayVisible).toHaveBeenCalledWith(false);
    expect(leases[1].setMapStyleElevationVisibility).toHaveBeenCalledWith(
      true,
      false
    );
    view.unmount();
    expect(leases[1].release).toHaveBeenCalledOnce();
  });
});
