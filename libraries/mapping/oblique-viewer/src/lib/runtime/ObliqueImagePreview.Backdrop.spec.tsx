import { act, cleanup, render } from "@testing-library/react";
import { Profiler, StrictMode, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { DevicePixels } from "@carma-units";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Backdrop } from "./ObliqueImagePreview.Backdrop";
import { ObliqueImagePreview } from "./ObliqueImagePreview";

vi.mock("./hooks/usePreviewSizeSync", () => ({ usePreviewSizeSync: vi.fn() }));
vi.mock("./hooks/usePrefetchedPreviewThumbnail", () => ({
  usePrefetchedPreviewThumbnail: () => null,
}));
vi.mock("./hooks/useScenePreviewImage", () => ({
  useScenePreviewImage: () => false,
}));
vi.mock("./ObliqueImagePreview.NativePixels", () => ({
  NativePixels: () => null,
}));
vi.mock("./ObliqueImagePreview.PreviewImage", () => ({
  PreviewImage: () => null,
}));

const fakeMap = () => {
  const listeners = new Set<() => void>();
  const on = vi.fn((event: string, listener: () => void) => {
    expect(event).toBe("render");
    listeners.add(listener);
  });
  const off = vi.fn((event: string, listener: () => void) => {
    expect(event).toBe("render");
    listeners.delete(listener);
  });
  return {
    map: { on, off, triggerRepaint: vi.fn() } as unknown as MaplibreMap,
    on,
    off,
    listeners,
    frame: () => act(() => listeners.forEach((listener) => listener())),
  };
};

const fromMarkup = (markup: string) => {
  const parent = document.createElement("div");
  parent.innerHTML = markup;
  return parent.firstElementChild as HTMLDivElement;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("controlled DOM preview backdrop", () => {
  it("is already transparent with the requested tint and filter before effects run", () => {
    const f = fakeMap();
    const element = fromMarkup(
      renderToStaticMarkup(
        <Backdrop
          map={f.map}
          opacityRef={{ current: 0 }}
          contrast={63}
          brightness={82}
          saturation={47}
          color="rgba(32, 48, 64, 0.75)"
        />
      )
    );
    expect(element.style.opacity).toBe("0");
    expect(element.style.backgroundColor).toBe("rgba(32, 48, 64, 0.75)");
    expect(element.getAttribute("style")).toContain(
      "backdrop-filter:contrast(63%) brightness(82%) saturate(47%)"
    );
    expect(f.on).not.toHaveBeenCalled();
  });

  it("follows render-frame entry and exit opacity on the same node without React commits or another RAF", () => {
    const f = fakeMap();
    const opacityRef = { current: 0 };
    const commits = vi.fn();
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const view = render(
      <Profiler id="backdrop" onRender={commits}>
        <Backdrop map={f.map} opacityRef={opacityRef} contrast={50} />
      </Profiler>
    );
    const element = view.getByRole("button");
    const commitCount = commits.mock.calls.length;
    for (const value of [0, 0.2, 0.8, 1, 0.5, 0]) {
      opacityRef.current = value;
      f.frame();
      expect(view.getByRole("button")).toBe(element);
      expect(element.style.opacity).toBe(String(value));
    }
    expect(commits).toHaveBeenCalledTimes(commitCount);
    expect(f.on).toHaveBeenCalledTimes(1);
    expect(raf).not.toHaveBeenCalled();
  });

  it("removes stale map/ref subscriptions and returns to the uncontrolled Classic style", () => {
    const first = fakeMap();
    const second = fakeMap();
    const oldOpacity = { current: 0 };
    const nextOpacity = { current: 0.4 };
    const view = render(
      <Backdrop map={first.map} opacityRef={oldOpacity} contrast={50} />
    );
    const element = view.getByRole("button");
    view.rerender(
      <Backdrop map={second.map} opacityRef={nextOpacity} contrast={50} />
    );
    expect(first.listeners.size).toBe(0);
    expect(second.listeners.size).toBe(1);
    oldOpacity.current = 1;
    first.frame();
    expect(element.style.opacity).toBe("0.4");
    const thirdOpacity = { current: 0.6 };
    view.rerender(
      <Backdrop map={second.map} opacityRef={thirdOpacity} contrast={50} />
    );
    nextOpacity.current = 0;
    second.frame();
    expect(element.style.opacity).toBe("0.6");
    expect(second.listeners.size).toBe(1);
    view.rerender(<Backdrop map={second.map} contrast={50} />);
    expect(element.style.opacity).toBe("");
    expect(second.listeners.size).toBe(0);
    view.unmount();
    expect(first.off).toHaveBeenCalledTimes(1);
    expect(second.off).toHaveBeenCalledTimes(2);
  });

  it("keeps exactly one listener during StrictMode replay and removes it on unmount", () => {
    const f = fakeMap();
    const opacityRef = { current: 0 };
    const view = render(
      <StrictMode>
        <Backdrop map={f.map} opacityRef={opacityRef} contrast={50} />
      </StrictMode>
    );
    expect(f.on).toHaveBeenCalledTimes(2);
    expect(f.off).toHaveBeenCalledTimes(1);
    expect(f.listeners.size).toBe(1);
    opacityRef.current = 0.8;
    f.frame();
    expect(view.getByRole("button").style.opacity).toBe("0.8");
    view.unmount();
    expect(f.listeners.size).toBe(0);
    expect(f.off).toHaveBeenCalledTimes(2);
    expect(f.off.mock.calls.map((call) => call[1])).toEqual(
      f.on.mock.calls.map((call) => call[1])
    );
  });

  it("clears the NG DOM filter immediately at scene handoff while preserving the Classic filter transition", () => {
    for (const controlled of [true, false]) {
      const f = fakeMap();
      const opacityRef = controlled ? { current: 0.5 } : undefined;
      const props = {
        map: f.map,
        opacityRef,
        contrast: 95,
        brightness: 125,
        saturation: 85,
      };
      const view = render(<Backdrop {...props} filterEnabled />);
      const element = view.getByRole("button");
      const lookTransition = element.style.transition;
      expect(lookTransition).toBe(
        "backdrop-filter 0.25s linear, -webkit-backdrop-filter 0.25s linear"
      );
      expect(element.style.backdropFilter).toBe(
        "contrast(95%) brightness(125%) saturate(85%)"
      );
      view.rerender(<Backdrop {...props} filterEnabled={false} />);
      expect(view.getByRole("button")).toBe(element);
      expect(element.style.backdropFilter).toBe("none");
      expect(element.style.transition).toBe(
        controlled ? "none" : lookTransition
      );
      expect(element.style.opacity).toBe(controlled ? "0.5" : "");
      expect(f.on).toHaveBeenCalledTimes(controlled ? 1 : 0);
      view.rerender(<Backdrop {...props} filterEnabled />);
      expect(element.style.transition).toBe(lookTransition);
      view.unmount();
    }
  });

  it("leaves an uncontrolled Classic backdrop without an opacity override or frame listener", () => {
    const f = fakeMap();
    const view = render(<Backdrop map={f.map} contrast={50} />);
    expect(view.getByRole("button").style.opacity).toBe("");
    f.frame();
    expect(f.on).not.toHaveBeenCalled();
    expect(f.off).not.toHaveBeenCalled();
    expect(
      fromMarkup(renderToStaticMarkup(<Backdrop contrast={50} />)).style.opacity
    ).toBe("");
  });
});

describe("preview DOM backdrop opt-in", () => {
  it.each([
    { mode: "Classic default", fadeBackdrop: undefined, controlled: false },
    { mode: "Classic explicit", fadeBackdrop: false, controlled: false },
    { mode: "NG", fadeBackdrop: true, controlled: true },
  ])(
    "forwards the existing opacity only in $mode",
    ({ fadeBackdrop, controlled }) => {
      const f = fakeMap();
      const opacityRef = { current: 0 };
      const props: ComponentProps<typeof ObliqueImagePreview> = {
        map: f.map,
        previewPath: "/photos",
        imageId: "photo",
        nativePixelSize: {
          width: 1024 as DevicePixels,
          height: 1024 as DevicePixels,
        },
        halfFovTan: 0.5,
        dimImage: false,
        rollDeg: 0,
        backdropLook: { contrast: 50, brightness: 100, saturation: 50 },
        opacityRef,
        fadeBackdrop,
      };
      const initial = fromMarkup(
        renderToStaticMarkup(<ObliqueImagePreview {...props} />)
      );
      expect(
        (initial.querySelector('[role="button"]') as HTMLElement).style.opacity
      ).toBe(controlled ? "0" : "");
      const view = render(<ObliqueImagePreview {...props} />);
      const backdrop = view.getByRole("button");
      opacityRef.current = 0.5;
      f.frame();
      expect(backdrop.style.opacity).toBe(controlled ? "0.5" : "");
      expect(f.listeners.size).toBe(controlled ? 1 : 0);
      view.unmount();
      expect(f.listeners.size).toBe(0);
    }
  );
});
