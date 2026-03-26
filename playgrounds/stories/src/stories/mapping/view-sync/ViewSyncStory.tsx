import { useEffect, useMemo, useRef } from "react";
import {
  ViewStateProvider,
  useViewAdapter,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import { SlotsLayout } from "./ViewSyncStorySlots";
import {
  createStoryTargetState,
  noopApplyViewState,
  shellStyle,
  type ViewSyncStoryProps,
} from "./viewSyncStoryShared";

import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

const ViewSyncStoryArgsSync = ({ target }: { target: ViewState }) => {
  const animationFrameRef = useRef<number | null>(null);
  const { claimControl, pushState, releaseControl } = useViewAdapter(
    "storybook-controls",
    "system",
    {
      apply: noopApplyViewState,
    }
  );

  useEffect(() => {
    const push = () => {
      if (!claimControl("restore")) {
        return;
      }
      pushState(target, "restore");
      releaseControl();
    };

    if (typeof window === "undefined") {
      push();
      return;
    }

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      push();
      animationFrameRef.current = null;
    });

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [claimControl, pushState, releaseControl, target]);

  return null;
};

export const ViewSyncStory = (props: ViewSyncStoryProps) => {
  const initialTarget = useMemo(
    () => createStoryTargetState(props),
    [
      props.altitudeM,
      props.bearingDeg,
      props.fovVerticalDeg,
      props.farPlaneM,
      props.latitudeDeg,
      props.longitudeDeg,
      props.nearPlaneM,
      props.pitchDeg,
      props.rangeM,
    ]
  );

  return (
    <ViewStateProvider>
      <ViewSyncStoryArgsSync target={initialTarget} />
      <div style={shellStyle}>
        <SlotsLayout fallbackTarget={initialTarget} />
      </div>
    </ViewStateProvider>
  );
};
