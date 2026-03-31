import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faCamera,
  faCropSimple,
  faHouseChimney,
  faMinus,
  faPlus,
  faRotate,
} from "@fortawesome/free-solid-svg-icons";
import {
  readControlButtonContentStyle,
  readControlButtonStyle,
} from "@carma-mapping/map-controls-layout";
import { createCompassNeedleElement } from "./compass-needle-dom";

type DomMouseHandler = (event: MouseEvent) => void;
type DomStyleRecord = Record<string, string | number | undefined>;

type NavigationButtonDomConfig = {
  disabled?: boolean;
  tooltip: string;
  title: string;
  dataTestId: string;
  cursor?: string;
  onClick?: DomMouseHandler;
  content?: HTMLElement | SVGSVGElement;
};

type NavigationCompassDomConfig = {
  disabled?: boolean;
  tooltip: string;
  title: string;
  dataTestId: string;
  cursor?: string;
  onMouseDown?: DomMouseHandler;
  onClick?: DomMouseHandler;
  onDoubleClick?: DomMouseHandler;
  content?: HTMLElement | SVGSVGElement;
};

type NavigationZoomGroupDomConfig = {
  zoomIn?: NavigationButtonDomConfig | null;
  zoomOut?: NavigationButtonDomConfig | null;
  footer?: NavigationButtonDomConfig | null;
  hidden?: boolean;
};

export type SceneNavigationDomConfig = {
  disabled?: boolean;
  style?: DomStyleRecord;
  home?: NavigationButtonDomConfig | null;
  orbit?: NavigationButtonDomConfig | null;
  zoomIn?: NavigationButtonDomConfig | null;
  zoomOut?: NavigationButtonDomConfig | null;
  secondaryZoom?: NavigationZoomGroupDomConfig | null;
  tertiaryZoom?: NavigationZoomGroupDomConfig | null;
  compass?: NavigationCompassDomConfig | null;
};

const UNIT_LESS_STYLE_KEYS = new Set([
  "opacity",
  "zIndex",
  "fontWeight",
  "flex",
  "flexGrow",
  "flexShrink",
  "order",
  "zoom",
  "lineHeight",
]);

const applyInlineStyles = (
  element: HTMLElement | SVGSVGElement,
  styles: DomStyleRecord
) => {
  Object.entries(styles).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    const nextValue =
      typeof value === "number" && !UNIT_LESS_STYLE_KEYS.has(key)
        ? `${value}px`
        : String(value);

    (element.style as unknown as Record<string, string>)[key] = nextValue;
  });
};

const createIconSvg = ({
  viewBox = "0 0 28 28",
  paths,
}: {
  viewBox?: string;
  paths: Array<{
    d: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: string;
    strokeLinecap?: string;
  }>;
}) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.style.width = "18px";
  svg.style.height = "18px";

  paths.forEach(({ d, fill, stroke, strokeWidth, strokeLinecap }) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    if (fill) {
      path.setAttribute("fill", fill);
    }
    if (stroke) {
      path.setAttribute("stroke", stroke);
    }
    if (strokeWidth) {
      path.setAttribute("stroke-width", strokeWidth);
    }
    if (strokeLinecap) {
      path.setAttribute("stroke-linecap", strokeLinecap);
    }
    svg.append(path);
  });

  return svg;
};

const createFontAwesomeSvg = (iconDefinition: IconDefinition) => {
  const [width, height, , , svgPathData] = iconDefinition.icon;
  const paths = Array.isArray(svgPathData) ? svgPathData : [svgPathData];

  return createIconSvg({
    viewBox: `0 0 ${width} ${height}`,
    paths: paths.map((d) => ({
      d,
      fill: "currentColor",
    })),
  });
};

const createPlusIcon = () => createFontAwesomeSvg(faPlus);

const createMinusIcon = () => createFontAwesomeSvg(faMinus);

const createHomeIcon = () => createFontAwesomeSvg(faHouseChimney);

export const createOrbitIconElement = () => createFontAwesomeSvg(faRotate);

export const createCameraIconElement = () => createFontAwesomeSvg(faCamera);

const createCameraZoomGlyph = (mode: "in" | "out") => {
  const glyph = document.createElement("div");
  applyInlineStyles(glyph, {
    position: "relative",
    width: 8,
    height: 8,
  });

  const horizontal = document.createElement("div");
  applyInlineStyles(horizontal, {
    position: "absolute",
    left: 0,
    top: "50%",
    width: "100%",
    height: 1.8,
    backgroundColor: "#0f172a",
    borderRadius: 999,
    transform: "translateY(-50%)",
  });
  glyph.append(horizontal);

  if (mode === "in") {
    const vertical = document.createElement("div");
    applyInlineStyles(vertical, {
      position: "absolute",
      left: "50%",
      top: 0,
      width: 1.8,
      height: "100%",
      backgroundColor: "#0f172a",
      borderRadius: 999,
      transform: "translateX(-50%)",
    });
    glyph.append(vertical);
  }

  return glyph;
};

export const createCameraZoomIconElement = (mode: "in" | "out") => {
  const wrapper = document.createElement("div");
  applyInlineStyles(wrapper, {
    position: "relative",
    width: 18,
    height: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const camera = createCameraIconElement();
  applyInlineStyles(camera, {
    width: 18,
    height: 18,
    display: "block",
  });
  wrapper.append(camera);

  const lensBadge = document.createElement("div");
  applyInlineStyles(lensBadge, {
    position: "absolute",
    left: "50%",
    top: "56%",
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#fff",
    boxShadow: "0 0 0 1px rgba(15, 23, 42, 0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transform: "translate(-50%, -50%)",
  });
  lensBadge.append(createCameraZoomGlyph(mode));
  wrapper.append(lensBadge);

  return wrapper;
};

export const createFovZoomIconElement = (mode: "in" | "out") => {
  const wrapper = document.createElement("div");
  applyInlineStyles(wrapper, {
    position: "relative",
    width: 18,
    height: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const crop = createFontAwesomeSvg(faCropSimple);
  applyInlineStyles(crop, {
    width: 18,
    height: 18,
    display: "block",
  });
  wrapper.append(crop);

  const glyph = createCameraZoomGlyph(mode);
  applyInlineStyles(glyph, {
    position: "absolute",
    left: "50%",
    top: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transform: "translate(-50%, -50%)",
  });
  wrapper.append(glyph);

  return wrapper;
};

export const createOrbitIconController = (
  iconElement: SVGSVGElement,
  {
    mirrored = false,
  }: {
    mirrored?: boolean;
  } = {}
) => {
  let isActive = false;
  let frameId: number | null = null;
  let hasBearing = false;
  let lastBearingDeg = 0;
  let unwrappedBearingDeg = 0;

  const scheduleApply = () => {
    if (frameId !== null) {
      return;
    }

    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      const baseTransform = mirrored ? " scaleX(-1)" : "";
      iconElement.style.transform = isActive
        ? `rotate(${-unwrappedBearingDeg}deg)${baseTransform}`
        : `rotate(0deg)${baseTransform}`;
    });
  };

  const readShortestBearingDeltaDeg = (
    previousBearingDeg: number,
    nextBearingDeg: number
  ) =>
    ((((nextBearingDeg - previousBearingDeg + 180) % 360) + 360) % 360) - 180;

  iconElement.style.transformOrigin = "50% 50%";
  iconElement.style.willChange = "transform";

  return {
    setBearingDeg(bearingDeg: number) {
      if (!Number.isFinite(bearingDeg)) {
        return;
      }

      if (!hasBearing) {
        hasBearing = true;
        lastBearingDeg = bearingDeg;
        unwrappedBearingDeg = bearingDeg;
        scheduleApply();
        return;
      }

      const deltaDeg = readShortestBearingDeltaDeg(lastBearingDeg, bearingDeg);
      lastBearingDeg = bearingDeg;
      unwrappedBearingDeg += deltaDeg;
      scheduleApply();
    },
    setActive(active: boolean) {
      if (isActive === active) {
        return;
      }

      isActive = active;
      scheduleApply();
    },
    destroy() {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      iconElement.style.transform = mirrored
        ? "rotate(0deg) scaleX(-1)"
        : "rotate(0deg)";
      iconElement.style.willChange = "";
    },
  };
};

const createButton = ({
  config,
  content,
  disabled,
  groupTop = false,
  groupBottom = false,
}: {
  config: NavigationButtonDomConfig | NavigationCompassDomConfig;
  content: HTMLElement | SVGSVGElement;
  disabled: boolean;
  groupTop?: boolean;
  groupBottom?: boolean;
}) => {
  const button = document.createElement("button");
  button.type = "button";
  button.disabled = disabled;
  button.dataset.testId = config.dataTestId;
  button.title = config.tooltip;
  button.setAttribute("aria-label", config.title);

  applyInlineStyles(button, {
    ...readControlButtonStyle({
      disabled,
      cursor: config.cursor,
    }),
    borderBottomWidth: groupTop ? 0 : undefined,
    borderTopWidth: groupBottom ? 1 : undefined,
    borderBottomLeftRadius: groupTop ? 0 : undefined,
    borderBottomRightRadius: groupTop ? 0 : undefined,
    borderTopLeftRadius: groupBottom ? 0 : undefined,
    borderTopRightRadius: groupBottom ? 0 : undefined,
    padding: 0,
    color: "#111827",
  });

  const inner = document.createElement("div");
  applyInlineStyles(inner, {
    ...readControlButtonContentStyle({ disabled }),
    justifyContent: "center",
    width: "100%",
    height: "100%",
  });
  inner.append(content);
  button.append(inner);

  if ("onMouseDown" in config && config.onMouseDown) {
    button.addEventListener("mousedown", config.onMouseDown);
  }
  if (config.onClick) {
    button.addEventListener("click", config.onClick);
  }
  if ("onDoubleClick" in config && config.onDoubleClick) {
    button.addEventListener("dblclick", config.onDoubleClick);
  }

  return button;
};

const createCompassContent = (
  content?: HTMLElement | SVGSVGElement,
  cursor?: string
) => {
  const wrapper = document.createElement("div");
  applyInlineStyles(wrapper, {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: cursor ?? "pointer",
  });
  wrapper.append(content ?? createCompassNeedleElement());
  return wrapper;
};

const appendZoomGroup = ({
  root,
  disabled,
  zoomIn,
  zoomOut,
  footer,
  hidden = false,
}: {
  root: HTMLDivElement;
  disabled: boolean;
  zoomIn?: NavigationButtonDomConfig | null;
  zoomOut?: NavigationButtonDomConfig | null;
  footer?: NavigationButtonDomConfig | null;
  hidden?: boolean;
}) => {
  if (!zoomIn && !zoomOut && !footer) {
    return;
  }

  const group = document.createElement("div");
  applyInlineStyles(group, {
    display: hidden ? "none" : "flex",
    flexDirection: "column",
  });

  if (zoomIn) {
    group.append(
      createButton({
        config: zoomIn,
        content: zoomIn.content ?? createPlusIcon(),
        disabled: disabled || Boolean(zoomIn.disabled),
        groupTop: true,
      })
    );
  }

  if (zoomOut) {
    group.append(
      createButton({
        config: zoomOut,
        content: zoomOut.content ?? createMinusIcon(),
        disabled: disabled || Boolean(zoomOut.disabled),
        groupBottom: !footer,
      })
    );
  }

  if (footer) {
    group.append(
      createButton({
        config: footer,
        content: footer.content ?? createCameraIconElement(),
        disabled: disabled || Boolean(footer.disabled),
        groupBottom: true,
      })
    );
  }

  root.append(group);
};

export const mountSceneNavigationControls = (
  host: HTMLElement,
  {
    disabled = false,
    style = {},
    home = null,
    orbit = null,
    zoomIn = null,
    zoomOut = null,
    secondaryZoom = null,
    tertiaryZoom = null,
    compass = null,
  }: SceneNavigationDomConfig
) => {
  const root = document.createElement("div");
  applyInlineStyles(root, {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 1600,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    pointerEvents: disabled ? "none" : "auto",
    opacity: disabled ? 0.55 : 1,
    ...style,
  });

  if (home) {
    root.append(
      createButton({
        config: home,
        content: home.content ?? createHomeIcon(),
        disabled: disabled || Boolean(home.disabled),
      })
    );
  }

  if (orbit) {
    root.append(
      createButton({
        config: orbit,
        content: orbit.content ?? createOrbitIconElement(),
        disabled: disabled || Boolean(orbit.disabled),
      })
    );
  }

  appendZoomGroup({ root, disabled, zoomIn, zoomOut });
  appendZoomGroup({
    root,
    disabled,
    zoomIn: secondaryZoom?.zoomIn,
    zoomOut: secondaryZoom?.zoomOut,
    footer: secondaryZoom?.footer,
    hidden: secondaryZoom?.hidden,
  });
  appendZoomGroup({
    root,
    disabled,
    zoomIn: tertiaryZoom?.zoomIn,
    zoomOut: tertiaryZoom?.zoomOut,
    footer: tertiaryZoom?.footer,
    hidden: tertiaryZoom?.hidden,
  });

  if (compass) {
    root.append(
      createButton({
        config: compass,
        content: createCompassContent(compass.content, compass.cursor),
        disabled: disabled || Boolean(compass.disabled),
      })
    );
  }

  host.append(root);

  return () => {
    root.remove();
  };
};
