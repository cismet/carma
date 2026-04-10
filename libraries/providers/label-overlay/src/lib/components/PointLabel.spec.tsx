import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PILLBUTTON_BADGE_POSITIONS } from "./PillbuttonLabelMarker";
import {
  PointLabel,
  POINT_LABEL_ATTACH,
  POINT_LABEL_STYLE,
} from "./PointLabel";

const expectEmOrEx = (value: string | undefined, expected: string) => {
  expect([expected, expected.replace(/em$/u, "ex")]).toContain(value ?? "");
};

describe("PointLabel", () => {
  it("renders the shared label root with normal blend mode", () => {
    const { container } = render(
      <PointLabel content="NHN 179,74 m" hideMarker={true} />
    );

    const labelRoot = container.querySelector(
      '[data-point-label-root="true"]'
    ) as HTMLDivElement | null;

    expect(labelRoot?.style.mixBlendMode).toBe("normal");
  });

  it("uses a lighter default label shell background with a smaller blur radius", () => {
    const { container } = render(
      <PointLabel content="NHN 179,74 m" hideMarker={true} />
    );

    const labelRoot = container.querySelector(
      '[data-point-label-content-root="true"]'
    ) as HTMLDivElement | null;

    expect(labelRoot?.style.backgroundColor).toBe("rgba(30, 41, 59, 0.62)");
    expect(labelRoot?.style.backdropFilter).toBe(
      "blur(5px) brightness(0.9) saturate(1.04)"
    );
  });

  it("keeps content-less point node markers outline-only without fill", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        hideLabelAndStem={true}
        hideMarker={false}
      />
    );

    const marker = container.querySelector(
      '[data-point-label-interactive="true"]'
    ) as HTMLDivElement | null;

    expect(["transparent", "rgba(0, 0, 0, 0)"]).toContain(
      marker?.style.backgroundColor ?? ""
    );
    expect(marker?.style.borderColor).toBe("#fff");
  });

  it("anchors center-attached compact-only pills at the badge center", () => {
    const { container } = render(
      <PointLabel
        content=""
        badgeContent="14"
        collapse={true}
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

  it("removes root border and backdrop for compact badge-only pills", () => {
    const { container } = render(
      <PointLabel
        content=""
        badgeContent="B"
        collapse={true}
        hideMarker={true}
        fontSize="12px"
        labelAttach={POINT_LABEL_ATTACH.RIGHT}
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;
    const badge = container.querySelector(
      '[data-pillbutton-badge="true"]'
    ) as HTMLSpanElement | null;

    expect(pillRoot?.getAttribute("style") ?? "").not.toContain(
      "border: 1px"
    );
    expect(pillRoot?.style.backgroundColor).toBe("transparent");
    expect(pillRoot?.style.backdropFilter).toBe("none");
    expect(badge?.style.border).toContain("1px");
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

  it("does not render a border on the full pill container by default", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        badgeContent="3"
        hideMarker={true}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.LEFT}
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;
    const badge = container.querySelector(
      '[data-pillbutton-badge="true"]'
    ) as HTMLSpanElement | null;

    expect(["", "none"]).toContain(pillRoot?.style.border ?? "");
    expect(pillRoot?.getAttribute("style") ?? "").not.toContain("border: 1px");
    expect(badge?.style.border).toContain("1px");
  });

  it("applies explicit typography props to pill labels", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        badgeContent="B"
        hideMarker={true}
        fontSize="14px"
        fontFamily='"Helvetica Neue", Arial, Helvetica, sans-serif'
        fontWeight={500}
        labelAttach={POINT_LABEL_ATTACH.LEFT}
        labelStyle={POINT_LABEL_STYLE.CAPSULE}
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;

    expect(pillRoot?.style.fontSize).toBe("14px");
    expect(pillRoot?.style.fontWeight).toBe("500");
    expect(pillRoot?.style.fontFamily).toContain("Helvetica Neue");
  });

  it("keeps badge text at medium weight when pill content uses regular weight", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        badgeContent="8"
        hideMarker={true}
        fontSize="14px"
        fontWeight={400}
        labelAttach={POINT_LABEL_ATTACH.LEFT}
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;
    const badge = container.querySelector(
      '[data-pillbutton-badge="true"]'
    ) as HTMLSpanElement | null;

    expect(pillRoot?.style.fontWeight).toBe("400");
    expect(badge?.style.fontWeight).toBe("500");
  });

  it("renders right-slot badges after the content segment", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        badgeContent="3"
        hideMarker={true}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.RIGHT}
        badgePosition={PILLBUTTON_BADGE_POSITIONS.RIGHT}
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;
    const pillContent = container.querySelector(
      '[data-pillbutton-content="true"]'
    ) as HTMLSpanElement | null;
    const contentSegment = container.querySelector(
      '[data-pillbutton-segment="content"]'
    ) as HTMLSpanElement | null;
    const endBadge = container.querySelector(
      '[data-pillbutton-badge-slot="end"]'
    ) as HTMLSpanElement | null;

    expect(pillRoot).not.toBeNull();
    expect(pillContent).not.toBeNull();
    expect(contentSegment).not.toBeNull();
    expect(endBadge).not.toBeNull();
    expect(
      (contentSegment as Node).compareDocumentPosition(endBadge as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(pillRoot?.contains(endBadge)).toBe(true);
    expect(pillContent?.contains(endBadge)).toBe(false);
  });

  it("uses a right-side badge by default for right-attached pill labels", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        badgeContent="3"
        hideMarker={true}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.RIGHT}
      />
    );

    const endBadge = container.querySelector(
      '[data-pillbutton-badge-slot="end"]'
    ) as HTMLSpanElement | null;
    const startBadge = container.querySelector(
      '[data-pillbutton-badge-slot="start"]'
    ) as HTMLSpanElement | null;

    expect(endBadge).not.toBeNull();
    expect(startBadge).toBeNull();
  });

  it("renders left-slot badges before the content segment", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        badgeContent="33333"
        hideMarker={true}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.LEFT}
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;
    const pillContent = container.querySelector(
      '[data-pillbutton-content="true"]'
    ) as HTMLSpanElement | null;
    const contentSegment = container.querySelector(
      '[data-pillbutton-segment="content"]'
    ) as HTMLSpanElement | null;
    const startBadge = container.querySelector(
      '[data-pillbutton-badge-slot="start"]'
    ) as HTMLSpanElement | null;

    expect(pillRoot).not.toBeNull();
    expect(pillContent).not.toBeNull();
    expect(contentSegment).not.toBeNull();
    expect(startBadge).not.toBeNull();
    expect(
      (startBadge as Node).compareDocumentPosition(contentSegment as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(pillRoot?.contains(startBadge)).toBe(true);
    expect(pillContent?.contains(startBadge)).toBe(false);
  });

  it("anchors left-attached labels at the capsule left cap", () => {
    const { container } = render(
      <PointLabel
        content="-24,86 m"
        badgeContent="11111"
        hideMarker={true}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.LEFT}
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;

    expect(pillRoot?.style.transform).toBe("translate(-1em, -50%)");
  });

  it("scales regular label x padding with the configured font size while keeping y padding at zero", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        hideMarker={true}
        fontSize="20px"
        labelAttach={POINT_LABEL_ATTACH.LEFT}
      />
    );

    const labelRoot = container.querySelector(
      '[data-point-label-content-root="true"]'
    ) as HTMLDivElement | null;

    expect(labelRoot?.style.padding).toBe("0px 20px");
  });

  it("scales pill label x padding from half the computed label height", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        hideMarker={true}
        fontSize="20px"
        labelAttach={POINT_LABEL_ATTACH.LEFT}
        labelStyle={POINT_LABEL_STYLE.CAPSULE}
      />
    );

    const pillContent = container.querySelector(
      '[data-pillbutton-segment="content"]'
    ) as HTMLSpanElement | null;

  expectEmOrEx(pillContent?.style.paddingRight, "1em");
  expectEmOrEx(pillContent?.style.paddingLeft, "1em");
  });

  it("shortens leading content x padding when a left badge is present", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        badgeContent="3"
        hideMarker={true}
        fontSize="20px"
        labelAttach={POINT_LABEL_ATTACH.LEFT}
        labelStyle={POINT_LABEL_STYLE.CAPSULE}
      />
    );

    const pillContent = container.querySelector(
      '[data-pillbutton-segment="content"]'
    ) as HTMLSpanElement | null;

    expect(pillContent?.style.paddingLeft).toBe("0em");
  expectEmOrEx(pillContent?.style.paddingRight, "1em");
  });

  it("shortens trailing content x padding when a right badge is present", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        badgeContent="3"
        hideMarker={true}
        fontSize="20px"
        labelAttach={POINT_LABEL_ATTACH.RIGHT}
        badgePosition={PILLBUTTON_BADGE_POSITIONS.RIGHT}
        labelStyle={POINT_LABEL_STYLE.CAPSULE}
      />
    );

    const pillContent = container.querySelector(
      '[data-pillbutton-segment="content"]'
    ) as HTMLSpanElement | null;

    expectEmOrEx(pillContent?.style.paddingLeft, "1em");
    expect(pillContent?.style.paddingRight).toBe("0em");
  });

  it("does not arm long press on the label shell when marker-only long press is enabled", () => {
    const onLongPress = vi.fn();
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        badgeContent="3"
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
        badgeContent="3"
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
