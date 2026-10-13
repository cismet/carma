import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { acquire, leases, options } = vi.hoisted(() => ({
  acquire: vi.fn(),
  options: {
    next: true,
    isOn: true,
    mapStyle3dEnabled: false,
    previewBasemapLabels: true,
  },
  leases: [] as Array<{
    setPointLabelOverlayVisible: ReturnType<typeof vi.fn>;
    setMapStyleElevationVisibility: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: acquire,
}));

vi.mock("@carma-providers/feature-flag", () => ({
  useFeatureFlags: () => ({ featureFlagObliqueNextUi: options.next }),
}));
vi.mock("../ObliqueViewer/oblique-actions", () => ({
  useObliqueViewerActions: () => options,
}));
beforeEach(() => {
  Object.assign(options, {
    next: true,
    isOn: true,
    mapStyle3dEnabled: false,
    previewBasemapLabels: true,
  });
  acquire.mockImplementation(() => {
    const lease = {
      setPointLabelOverlayVisible: vi.fn(),
      setMapStyleElevationVisibility: vi.fn(),
      release: vi.fn(),
    };
    leases.push(lease);
    return lease;
  });
});

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
  it("gates controlled NG presentation and its nested labels, restoring only its own lease", () => {
    const map = {} as NonNullable<
      AddonComponentProps<"mapStyle3d">["libreMap"]
    >;
    const props = propsFor(map, { controlledBy: "obliqueViewer" });
    const view = render(<MapStyle3d {...props} />);
    expect(acquire).not.toHaveBeenCalled();
    options.mapStyle3dEnabled = true;
    view.rerender(<MapStyle3d {...props} />);
    expect(leases[0].setPointLabelOverlayVisible).toHaveBeenCalledWith(true);
    options.previewBasemapLabels = false;
    view.rerender(<MapStyle3d {...props} />);
    expect(leases[0].release).toHaveBeenCalledOnce();
    expect(leases[1].setPointLabelOverlayVisible).toHaveBeenCalledWith(false);
    options.mapStyle3dEnabled = false;
    view.rerender(<MapStyle3d {...props} />);
    expect(leases[1].release).toHaveBeenCalledOnce();
    expect(acquire).toHaveBeenCalledTimes(2);
    options.mapStyle3dEnabled = true;
    options.isOn = false;
    view.rerender(<MapStyle3d {...props} />);
    expect(acquire).toHaveBeenCalledTimes(2);
  });
  it("preserves Classic controlled-route and standalone presentation independently", () => {
    const map = {} as NonNullable<
      AddonComponentProps<"mapStyle3d">["libreMap"]
    >;
    options.next = false;
    const view = render(
      <MapStyle3d {...propsFor(map, { controlledBy: "obliqueViewer" })} />
    );
    expect(leases[0].setPointLabelOverlayVisible).toHaveBeenCalledWith(true);
    view.unmount();
    options.next = true;
    render(<MapStyle3d {...propsFor(map)} />);
    expect(leases[1].setPointLabelOverlayVisible).toHaveBeenCalledWith(true);
  });
});
