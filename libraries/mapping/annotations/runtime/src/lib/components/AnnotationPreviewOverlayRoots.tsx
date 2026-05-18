import type { CSSProperties } from "react";

import {
  ANNOTATION_OVERLAY_GROUP,
  ANNOTATION_OVERLAY_GROUP_RENDER_ORDER,
  resolveAnnotationOverlayMountConfig,
  type AnnotationOverlayGroup,
} from "../interaction/preview-overlay-mount.shared";

const ANNOTATION_OVERLAY_ROOT_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  isolation: "isolate",
};

const ANNOTATION_OVERLAY_CONTAINER_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
};

const ANNOTATION_OVERLAY_Z_INDEX_BY_GROUP: Readonly<
  Record<AnnotationOverlayGroup, number>
> = Object.freeze({
  [ANNOTATION_OVERLAY_GROUP.VISUALIZER]: 100,
  [ANNOTATION_OVERLAY_GROUP.LABEL]: 110,
});

type AnnotationOverlayRootsProps = {
  groups?: readonly AnnotationOverlayGroup[];
};

export const AnnotationOverlayRoots = ({
  groups = ANNOTATION_OVERLAY_GROUP_RENDER_ORDER,
}: AnnotationOverlayRootsProps) => (
  <>
    {groups.map((group) => {
      const { rootAttribute, containerAttribute } =
        resolveAnnotationOverlayMountConfig(group);

      return (
        <div
          key={group}
          {...{
            [rootAttribute]: "true",
          }}
          style={{
            ...ANNOTATION_OVERLAY_ROOT_STYLE,
            zIndex: ANNOTATION_OVERLAY_Z_INDEX_BY_GROUP[group],
          }}
        >
          <div
            {...{
              [containerAttribute]: "true",
            }}
            style={ANNOTATION_OVERLAY_CONTAINER_STYLE}
          />
        </div>
      );
    })}
  </>
);

export const AnnotationPreviewOverlayRoots = AnnotationOverlayRoots;
