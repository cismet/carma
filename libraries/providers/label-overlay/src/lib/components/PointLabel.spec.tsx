import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PILLBUTTON_BADGE_POSITIONS } from "./PillbuttonLabelMarker";
import {
  PointLabel,
  POINT_LABEL_ATTACH,
  POINT_LABEL_STYLE,
} from "./PointLabel";

describe("PointLabel", () => {
  it("anchors center-attached compact-only pills at the badge center", () => {
    const { container } = render(
      <PointLabel
        content=""
        compactContent="14"
        collapse={true}
        hideMarker={true}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.CENTER}
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;

    expect(pillRoot?.style.transform).toBe("translate(-10px, -50%)");
  });

  it("keeps extended center-attached pills centered on the full badge", () => {
    const { container } = render(
      <PointLabel
        content="Point 14"
        labelStyle={POINT_LABEL_STYLE.CAPSULE}
        hideMarker={true}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.CENTER}
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;

    expect(pillRoot?.style.transform).toBe("translate(-50%, -50%)");
  });

  it("right-aligns extended text when the badge is mounted on the right", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        compactContent="3"
        hideMarker={true}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.RIGHT}
        badgePosition={PILLBUTTON_BADGE_POSITIONS.RIGHT}
      />
    );

    const pillContent = container.querySelector(
      '[data-pillbutton-content="true"]'
    ) as HTMLSpanElement | null;

    expect(pillContent?.style.justifyContent).toBe("flex-end");
    expect(pillContent?.style.textAlign).toBe("right");
  });

  it("offsets extended content by the measured wide badge width", () => {
    const scrollWidthGetter = vi
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(36);
    const offsetHeightGetter = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(19);

    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        compactContent="33333"
        hideMarker={true}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.LEFT}
      />
    );

    const pillContent = container.querySelector(
      '[data-pillbutton-content="true"]'
    ) as HTMLSpanElement | null;

    expect(pillContent?.style.paddingLeft).toBe("calc(36px)");

    scrollWidthGetter.mockRestore();
    offsetHeightGetter.mockRestore();
  });

  it("anchors left-attached wide badges at the inner right badge cap", () => {
    const scrollWidthGetter = vi
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(36);
    const offsetHeightGetter = vi
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(19);

    const { container } = render(
      <PointLabel
        content="-24,86 m"
        compactContent="11111"
        hideMarker={true}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.LEFT}
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;

    expect(pillRoot?.style.transform).toBe("translate(-26px, -50%)");

    scrollWidthGetter.mockRestore();
    offsetHeightGetter.mockRestore();
  });

  it("does not arm long press on the label shell when marker-only long press is enabled", () => {
    const onLongPress = vi.fn();
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        compactContent="3"
        hideMarker={false}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.RIGHT}
        onLongPress={onLongPress}
        longPressOnlyOnMarker={true}
      />
    );

    const labelRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;

    labelRoot?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    labelRoot?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("arms long press on a hidden marker interaction target when the visible marker is suppressed", () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        compactContent="3"
        hideMarker={true}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.RIGHT}
        onLongPress={onLongPress}
        longPressOnlyOnMarker={true}
        renderHiddenMarkerInteractionTarget={true}
        longPressDurationMs={300}
      />
    );

    const markerTarget = container.querySelector(
      '[data-point-label-hidden-marker-target="true"]'
    ) as HTMLDivElement | null;

    markerTarget?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    vi.advanceTimersByTime(320);

    expect(onLongPress).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
