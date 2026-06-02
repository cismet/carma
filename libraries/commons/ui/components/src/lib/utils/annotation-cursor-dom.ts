import type { AnnotationCursorSvgPathDefinition } from "./annotation-cursor-layered-svg-data-url";
import {
  CSS_MIX_BLEND_MODE,
  type CssMixBlendMode,
} from "@carma-commons/dom/document";

const SVG_NS = "http://www.w3.org/2000/svg";
const CURSOR_SHADOW_FILTER_REGION_INSET_PERCENT = 100;
const CURSOR_SHADOW_FILTER_REGION_SIZE_PERCENT = 300;

let annotationCursorSvgFilterIdCounter = 0;

type AnnotationCursorSvgRootOptions = {
  blendMode?: CssMixBlendMode;
  sizePx: number;
  viewBox: string;
};

export type AnnotationCursorShadowSvgElementOptions = {
  blendMode?: CssMixBlendMode;
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  shadowBlurPx: number;
  shadowStrokeColor: string;
  shadowStrokeLinejoin: "miter" | "round";
  shadowStrokeWidth: number;
  sizePx: number;
  viewBox: string;
};

export type AnnotationCursorForegroundSvgElementOptions = {
  blendMode?: CssMixBlendMode;
  foregroundFill: string;
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  sizePx: number;
  viewBox: string;
};

export type AnnotationCursorLayerHostElementOptions = {
  blendMode?: CssMixBlendMode;
  svgElement: SVGSVGElement;
};

export type AnnotationCursorLayeredDomElementOptions = {
  canvasSizePx: number;
  foregroundBlendMode?: CssMixBlendMode;
  foregroundFill: string;
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  shadowBlendMode?: CssMixBlendMode;
  shadowBlurPx: number;
  shadowStrokeColor: string;
  shadowStrokeLinejoin: "miter" | "round";
  shadowStrokeWidth: number;
  showAura: boolean;
  viewBox: string;
};

const createSvgElementNode = <ElementName extends keyof SVGElementTagNameMap>(
  elementName: ElementName
) => document.createElementNS(SVG_NS, elementName);

const applySvgRootAttributes = (
  svgElement: SVGSVGElement,
  {
    blendMode = CSS_MIX_BLEND_MODE.NORMAL,
    sizePx,
    viewBox,
  }: AnnotationCursorSvgRootOptions
) => {
  svgElement.setAttribute("xmlns", SVG_NS);
  svgElement.setAttribute("width", `${sizePx}`);
  svgElement.setAttribute("height", `${sizePx}`);
  svgElement.setAttribute("viewBox", viewBox);
  svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svgElement.setAttribute("shape-rendering", "geometricPrecision");
  svgElement.style.display = "block";
  svgElement.style.overflow = "visible";
  svgElement.style.mixBlendMode = blendMode;
  svgElement.style.pointerEvents = "none";
};

const appendCursorPaths = ({
  filterId,
  fill,
  pathDefinitions,
  parentElement,
  stroke,
  strokeLinejoin,
  strokeWidth,
}: {
  filterId?: string;
  fill: string;
  parentElement: SVGElement;
  pathDefinitions: readonly AnnotationCursorSvgPathDefinition[];
  stroke?: string;
  strokeLinejoin?: "miter" | "round";
  strokeWidth?: number;
}) => {
  pathDefinitions.forEach(({ pathD }) => {
    const pathElement = createSvgElementNode("path");
    pathElement.setAttribute("d", pathD);
    pathElement.setAttribute("fill", fill);

    if (typeof stroke === "string") {
      pathElement.setAttribute("stroke", stroke);
    }

    if (typeof strokeLinejoin === "string") {
      pathElement.setAttribute("stroke-linejoin", strokeLinejoin);
    }

    if (typeof strokeWidth === "number") {
      pathElement.setAttribute("stroke-width", `${strokeWidth}`);
    }

    if (typeof filterId === "string" && filterId.length > 0) {
      pathElement.setAttribute("filter", `url(#${filterId})`);
    }

    parentElement.appendChild(pathElement);
  });
};

const appendShadowBlurFilter = (
  svgElement: SVGSVGElement,
  shadowBlurPx: number,
  shadowStrokeColor: string
): string | undefined => {
  if (!(shadowBlurPx > 0)) {
    return undefined;
  }

  annotationCursorSvgFilterIdCounter += 1;
  const filterId = `annotation-cursor-shadow-blur-${annotationCursorSvgFilterIdCounter}`;
  const defsElement = createSvgElementNode("defs");
  const filterElement = createSvgElementNode("filter");
  const filterPrimitiveElement = createSvgElementNode("feDropShadow");

  filterElement.setAttribute("id", filterId);
  filterElement.setAttribute(
    "x",
    `-${CURSOR_SHADOW_FILTER_REGION_INSET_PERCENT}%`
  );
  filterElement.setAttribute(
    "y",
    `-${CURSOR_SHADOW_FILTER_REGION_INSET_PERCENT}%`
  );
  filterElement.setAttribute(
    "width",
    `${CURSOR_SHADOW_FILTER_REGION_SIZE_PERCENT}%`
  );
  filterElement.setAttribute(
    "height",
    `${CURSOR_SHADOW_FILTER_REGION_SIZE_PERCENT}%`
  );
  filterPrimitiveElement.setAttribute("dx", "0");
  filterPrimitiveElement.setAttribute("dy", "0");
  filterPrimitiveElement.setAttribute("flood-color", shadowStrokeColor);
  filterPrimitiveElement.setAttribute("flood-opacity", "1");
  filterPrimitiveElement.setAttribute("stdDeviation", `${shadowBlurPx}`);

  filterElement.appendChild(filterPrimitiveElement);
  defsElement.appendChild(filterElement);
  svgElement.appendChild(defsElement);

  return filterId;
};

export const createAnnotationCursorForegroundSvgElement = ({
  blendMode = "normal",
  foregroundFill,
  pathDefinitions,
  sizePx,
  viewBox,
}: AnnotationCursorForegroundSvgElementOptions) => {
  const svgElement = createSvgElementNode("svg");
  applySvgRootAttributes(svgElement, {
    blendMode,
    sizePx,
    viewBox,
  });
  appendCursorPaths({
    fill: foregroundFill,
    parentElement: svgElement,
    pathDefinitions,
  });
  return svgElement;
};

export const createAnnotationCursorShadowSvgElement = ({
  blendMode = "normal",
  pathDefinitions,
  shadowBlurPx,
  shadowStrokeColor,
  shadowStrokeLinejoin,
  shadowStrokeWidth,
  sizePx,
  viewBox,
}: AnnotationCursorShadowSvgElementOptions) => {
  const svgElement = createSvgElementNode("svg");
  const clampedShadowStrokeWidth = Math.max(shadowStrokeWidth, 0);
  const filterId = appendShadowBlurFilter(
    svgElement,
    Math.max(shadowBlurPx, 0),
    shadowStrokeColor
  );

  applySvgRootAttributes(svgElement, {
    blendMode,
    sizePx,
    viewBox,
  });

  appendCursorPaths({
    fill: shadowStrokeColor,
    filterId,
    parentElement: svgElement,
    pathDefinitions,
    stroke: clampedShadowStrokeWidth > 0 ? shadowStrokeColor : undefined,
    strokeLinejoin:
      clampedShadowStrokeWidth > 0 ? shadowStrokeLinejoin : undefined,
    strokeWidth:
      clampedShadowStrokeWidth > 0 ? clampedShadowStrokeWidth : undefined,
  });

  return svgElement;
};

export const createAnnotationCursorLayerHostElement = ({
  blendMode = "normal",
  svgElement,
}: AnnotationCursorLayerHostElementOptions) => {
  const layerElement = document.createElement("div");
  layerElement.style.position = "absolute";
  layerElement.style.inset = "0";
  layerElement.style.pointerEvents = "none";
  layerElement.style.mixBlendMode = "normal";
  svgElement.style.mixBlendMode = blendMode;
  layerElement.appendChild(svgElement);
  return layerElement;
};

export const createAnnotationCursorLayeredDomElement = ({
  canvasSizePx,
  foregroundBlendMode = "normal",
  foregroundFill,
  pathDefinitions,
  shadowBlendMode = "normal",
  shadowBlurPx,
  shadowStrokeColor,
  shadowStrokeLinejoin,
  shadowStrokeWidth,
  showAura,
  viewBox,
}: AnnotationCursorLayeredDomElementOptions) => {
  const containerElement = document.createElement("div");
  containerElement.style.position = "absolute";
  containerElement.style.left = "0";
  containerElement.style.top = "0";
  containerElement.style.width = `${canvasSizePx}px`;
  containerElement.style.height = `${canvasSizePx}px`;
  containerElement.style.pointerEvents = "none";
  containerElement.style.willChange = "transform";

  if (showAura) {
    containerElement.appendChild(
      createAnnotationCursorLayerHostElement({
        blendMode: shadowBlendMode,
        svgElement: createAnnotationCursorShadowSvgElement({
          blendMode: shadowBlendMode,
          pathDefinitions,
          shadowBlurPx,
          shadowStrokeColor,
          shadowStrokeLinejoin,
          shadowStrokeWidth,
          sizePx: canvasSizePx,
          viewBox,
        }),
      })
    );
  }

  containerElement.appendChild(
    createAnnotationCursorLayerHostElement({
      blendMode: foregroundBlendMode,
      svgElement: createAnnotationCursorForegroundSvgElement({
        blendMode: foregroundBlendMode,
        foregroundFill,
        pathDefinitions,
        sizePx: canvasSizePx,
        viewBox,
      }),
    })
  );

  return containerElement;
};

export const serializeAnnotationCursorSvgElement = (
  svgElement: SVGSVGElement
) => new XMLSerializer().serializeToString(svgElement);

export const encodeAnnotationCursorSvgElementDataUrl = (
  svgElement: SVGSVGElement
) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    serializeAnnotationCursorSvgElement(svgElement)
  )}`;
