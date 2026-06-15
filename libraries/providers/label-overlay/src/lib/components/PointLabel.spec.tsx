import { fireEvent, render } from "@testing-library/react";
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

  it("can override the shared label root blend mode", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        hideMarker={true}
        mixBlendMode="darken"
      />
    );

    const labelRoot = container.querySelector(
      '[data-point-label-root="true"]'
    ) as HTMLDivElement | null;

    expect(labelRoot?.style.mixBlendMode).toBe("darken");
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
    expect(["#fff", "rgb(255, 255, 255)", "rgba(255, 255, 255, 1)"]).toContain(
      marker?.style.borderColor ?? ""
    );
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

  it("uses the badge itself as the root element for compact badge-only pills", () => {
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
    ) as HTMLElement | null;
    const badge = container.querySelector(
      '[data-pillbutton-badge="true"]'
    ) as HTMLSpanElement | null;
    const pillContent = container.querySelector(
      '[data-pillbutton-content="true"]'
    ) as HTMLSpanElement | null;

    expect(pillRoot).toBe(badge);
    expect(pillContent).toBeNull();
    expect(["rgb(75, 85, 99)", "rgba(75, 85, 99, 1)"]).toContain(
      pillRoot?.style.backgroundColor ?? ""
    );
    expect(["", "none"]).toContain(badge?.style.border ?? "");
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
    expect(["", "none"]).toContain(badge?.style.border ?? "");
  });

  it("shows a single selection-colored badge border only while selected", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        badgeContent="8"
        hideMarker={true}
        selected={true}
        selectedTextColor="rgba(253, 224, 71, 0.99)"
        labelAttach={POINT_LABEL_ATTACH.LEFT}
      />
    );

    const badge = container.querySelector(
      '[data-pillbutton-badge="true"]'
    ) as HTMLSpanElement | null;

    expect(badge?.style.border).toBe("1px solid rgba(253, 224, 71, 0.99)");
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

  it("keeps existing fills on selection while applying signal-yellow text and a matching 5px outer glow", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        badgeContent="8"
        hideMarker={true}
        selected={true}
        textBackgroundColor="rgba(30, 64, 175, 0.78)"
        markerBackgroundColor="rgba(30, 58, 138, 0.98)"
        selectedBackgroundColor="rgba(15, 23, 42, 0.92)"
        selectedTextColor="rgba(253, 224, 71, 0.99)"
        selectedGlowColor="rgba(253, 224, 71, 0.99)"
        selectedGlowRadiusPx={5}
        preserveFillOnSelection={true}
        labelAttach={POINT_LABEL_ATTACH.LEFT}
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLDivElement | null;
    const badge = container.querySelector(
      '[data-pillbutton-badge="true"]'
    ) as HTMLSpanElement | null;

    expect(pillRoot?.style.backgroundColor).toBe("rgba(30, 64, 175, 0.78)");
    expect(pillRoot?.style.color).toBe("rgba(253, 224, 71, 0.99)");
    expect(pillRoot?.style.boxShadow).toBe("0 0 5px rgba(253, 224, 71, 0.99)");
    expect(badge?.style.backgroundColor).toBe("rgba(30, 58, 138, 0.98)");
    expect(badge?.style.color).toBe("rgba(253, 224, 71, 0.99)");
  });

  it("keeps compact badge-only selection styling on the single badge root", () => {
    const { container } = render(
      <PointLabel
        content="B"
        badgeContent="B"
        collapse={true}
        hideMarker={true}
        selected={true}
        markerBackgroundColor="rgba(17, 94, 89, 0.98)"
        selectedTextColor="rgba(253, 224, 71, 0.99)"
        selectedGlowColor="rgba(253, 224, 71, 0.99)"
        selectedGlowRadiusPx={5}
        preserveFillOnSelection={true}
        labelAttach={POINT_LABEL_ATTACH.RIGHT}
      />
    );

    const pillRoot = container.querySelector(
      '[data-pillbutton-root="true"]'
    ) as HTMLElement | null;
    const badge = container.querySelector(
      '[data-pillbutton-badge="true"]'
    ) as HTMLSpanElement | null;

    expect(pillRoot).toBe(badge);
    expect(badge?.style.backgroundColor).toBe("rgba(17, 94, 89, 0.98)");
    expect(badge?.style.boxShadow).toBe("0 0 5px rgba(253, 224, 71, 0.99)");
  });

  it("changes the point node marker ring to the selection color while selected", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        hideLabelAndStem={true}
        hideMarker={false}
        selected={true}
        selectedTextColor="rgba(253, 224, 71, 0.99)"
        selectedGlowColor="rgba(253, 224, 71, 0.99)"
      />
    );

    const marker = container.querySelector(
      '[data-point-label-interactive="true"]'
    ) as HTMLDivElement | null;

    expect(marker?.style.borderColor).toBe("rgba(253, 224, 71, 0.99)");
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

  it("selects unselected labels immediately even when double-click handling exists", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        hideMarker={true}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        selected={false}
      />
    );

    const labelRoot = container.querySelector(
      '[data-point-label-content-root="true"]'
    ) as HTMLDivElement | null;

    fireEvent.click(labelRoot!);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDoubleClick).not.toHaveBeenCalled();

    vi.advanceTimersByTime(240);

    expect(onClick).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("keeps selected-label single clicks delayed when double-click handling exists", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        hideMarker={true}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        selected={true}
      />
    );

    const labelRoot = container.querySelector(
      '[data-point-label-content-root="true"]'
    ) as HTMLDivElement | null;

    fireEvent.click(labelRoot!);

    expect(onClick).not.toHaveBeenCalled();

    vi.advanceTimersByTime(240);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDoubleClick).not.toHaveBeenCalled();
    vi.useRealTimers();
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

  it("keeps hidden marker interaction targets visually invisible while preserving their hit area", () => {
    const { container } = render(
      <PointLabel
        content="NHN 179,74 m"
        badgeContent="3"
        hideMarker={true}
        fontSize="10px"
        labelAttach={POINT_LABEL_ATTACH.RIGHT}
        onLongPress={vi.fn()}
        longPressOnlyOnMarker={true}
        renderHiddenMarkerInteractionTarget={true}
      />
    );

    const markerTarget = container.querySelector(
      '[data-point-label-hidden-marker-target="true"]'
    ) as HTMLDivElement | null;

    expect(markerTarget?.style.width).toBe("18px");
    expect(markerTarget?.style.height).toBe("18px");
    expect(markerTarget?.style.cursor).toBe("pointer");
    expect(markerTarget?.style.opacity).toBe("0");
    expect(markerTarget?.style.boxShadow).toBe("none");
    expect(markerTarget?.style.borderWidth).toBe("0px");
    expect(["transparent", "rgba(0, 0, 0, 0)"]).toContain(
      markerTarget?.style.backgroundColor ?? ""
    );
  });
});
