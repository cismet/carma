import {
  LABEL_OVERLAY_CONTAINER_ATTRIBUTE,
  LABEL_OVERLAY_CONTAINER_SELECTOR,
} from "@carma-providers/label-overlay";

import type { Scene } from "@carma-cesium";

export const PREVIEW_OVERLAY_GROUP = {
  LABEL: "label",
  VISUALIZER: "visualizer",
} as const;

export type PreviewOverlayGroup =
  (typeof PREVIEW_OVERLAY_GROUP)[keyof typeof PREVIEW_OVERLAY_GROUP];

export const ANNOTATION_OVERLAY_GROUP = PREVIEW_OVERLAY_GROUP;
export type AnnotationOverlayGroup = PreviewOverlayGroup;

export type PreviewOverlayMountConfig = {
  rootAttribute: string;
  containerAttribute: string;
  rootSelector: string;
  containerSelector: string;
};
export type AnnotationOverlayMountConfig = PreviewOverlayMountConfig;

const createDataAttributeSelector = (attribute: string) =>
  `[${attribute}="true"]`;

const LABEL_OVERLAY_ROOT_ATTRIBUTE = "data-annotation-label-overlay-root";
const VISUALIZER_OVERLAY_ROOT_ATTRIBUTE =
  "data-annotation-visualizer-overlay-root";
const VISUALIZER_OVERLAY_CONTAINER_ATTRIBUTE =
  "data-annotation-visualizer-overlay-container";
const VISUALIZER_OVERLAY_CONTAINER_SELECTOR = createDataAttributeSelector(
  VISUALIZER_OVERLAY_CONTAINER_ATTRIBUTE
);

export const PREVIEW_OVERLAY_GROUP_RENDER_ORDER = Object.freeze([
  PREVIEW_OVERLAY_GROUP.VISUALIZER,
  PREVIEW_OVERLAY_GROUP.LABEL,
] as const satisfies readonly PreviewOverlayGroup[]);
export const ANNOTATION_OVERLAY_GROUP_RENDER_ORDER =
  PREVIEW_OVERLAY_GROUP_RENDER_ORDER;

export const PREVIEW_OVERLAY_MOUNT_CONFIG_BY_GROUP: Readonly<
  Record<PreviewOverlayGroup, PreviewOverlayMountConfig>
> = Object.freeze({
  [PREVIEW_OVERLAY_GROUP.LABEL]: {
    rootAttribute: LABEL_OVERLAY_ROOT_ATTRIBUTE,
    containerAttribute: LABEL_OVERLAY_CONTAINER_ATTRIBUTE,
    rootSelector: createDataAttributeSelector(LABEL_OVERLAY_ROOT_ATTRIBUTE),
    containerSelector: LABEL_OVERLAY_CONTAINER_SELECTOR,
  },
  [PREVIEW_OVERLAY_GROUP.VISUALIZER]: {
    rootAttribute: VISUALIZER_OVERLAY_ROOT_ATTRIBUTE,
    containerAttribute: VISUALIZER_OVERLAY_CONTAINER_ATTRIBUTE,
    rootSelector: createDataAttributeSelector(
      VISUALIZER_OVERLAY_ROOT_ATTRIBUTE
    ),
    containerSelector: VISUALIZER_OVERLAY_CONTAINER_SELECTOR,
  },
});

export const resolvePreviewOverlayMountConfig = (group: PreviewOverlayGroup) =>
  PREVIEW_OVERLAY_MOUNT_CONFIG_BY_GROUP[group];
export const resolveAnnotationOverlayMountConfig =
  resolvePreviewOverlayMountConfig;

export const resolvePreviewContainer = (
  scene: Scene,
  group: PreviewOverlayGroup = PREVIEW_OVERLAY_GROUP.LABEL
) => {
  const { rootSelector, containerSelector } =
    resolvePreviewOverlayMountConfig(group);
  let currentContainer: HTMLElement | null = scene.canvas.parentElement;
  let fallbackContainer: HTMLElement | null = currentContainer;

  while (currentContainer) {
    if (currentContainer.matches(containerSelector)) {
      return currentContainer;
    }

    const explicitOverlayContainer =
      currentContainer.querySelector?.(containerSelector);
    if (explicitOverlayContainer instanceof HTMLElement) {
      return explicitOverlayContainer;
    }

    if (currentContainer.matches(rootSelector)) {
      return currentContainer;
    }

    const explicitOverlayRoot = currentContainer.querySelector?.(rootSelector);
    if (explicitOverlayRoot instanceof HTMLElement) {
      return explicitOverlayRoot;
    }

    fallbackContainer = currentContainer;
    currentContainer = currentContainer.parentElement;
  }

  return fallbackContainer;
};
export const resolveAnnotationOverlayContainer = resolvePreviewContainer;
