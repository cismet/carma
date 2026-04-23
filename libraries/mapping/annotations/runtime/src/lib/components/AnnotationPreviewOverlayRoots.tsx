import type { CSSProperties } from "react";

import {
  PREVIEW_OVERLAY_GROUP,
  PREVIEW_OVERLAY_GROUP_RENDER_ORDER,
  resolvePreviewOverlayMountConfig,
  type PreviewOverlayGroup,
} from "../interaction/preview-overlay-mount.shared";

const ANNOTATION_PREVIEW_OVERLAY_ROOT_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  isolation: "isolate",
};

const ANNOTATION_PREVIEW_OVERLAY_CONTAINER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
};

const ANNOTATION_PREVIEW_OVERLAY_Z_INDEX_BY_GROUP: Readonly<
  Record<PreviewOverlayGroup, number>
> = Object.freeze({
  [PREVIEW_OVERLAY_GROUP.VISUALIZER]: 100,
  [PREVIEW_OVERLAY_GROUP.LABEL]: 110,
});

type AnnotationPreviewOverlayRootsProps = {
  groups?: readonly PreviewOverlayGroup[];
};

export const AnnotationPreviewOverlayRoots = ({
  groups = PREVIEW_OVERLAY_GROUP_RENDER_ORDER,
}: AnnotationPreviewOverlayRootsProps) => (
  <>
    {groups.map((group) => {
      const { rootAttribute, containerAttribute } =
        resolvePreviewOverlayMountConfig(group);

      return (
        <div
          key={group}
          {...{
            [rootAttribute]: "true",
          }}
          style={{
            ...ANNOTATION_PREVIEW_OVERLAY_ROOT_STYLE,
            zIndex: ANNOTATION_PREVIEW_OVERLAY_Z_INDEX_BY_GROUP[group],
          }}
        >
          <div
            {...{
              [containerAttribute]: "true",
            }}
            style={ANNOTATION_PREVIEW_OVERLAY_CONTAINER_STYLE}
          />
        </div>
      );
    })}
  </>
);
