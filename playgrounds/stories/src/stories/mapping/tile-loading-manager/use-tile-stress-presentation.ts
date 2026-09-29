import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  createCanvasImageStrip,
  CANVAS_IMAGE_STRIP_INITIAL_VIEW,
  type CanvasImageStrip,
} from "@carma-commons/ui/components";
import { createSharedSceneCameraStrip } from "@carma-mapping/engines/maplibre";
import type { TileCameraStressArgs, World } from "./tile-camera-stress-types";

type CameraStrip = ReturnType<typeof createSharedSceneCameraStrip>;

export const useTileStressPresentation = ({
  args,
  world,
  controls,
  showStrip,
  isLight,
  closedStrip,
  showBothSides,
  upperSide,
  stripCanvas,
  stripViewport,
  stripPresentation,
  oppositeViewport,
  oppositePresentation,
  oppositeStrip,
  navigationRange,
  arrayStrip,
  stripLabelHeight,
  setStation,
  setElevationOffset,
  setStripScrollable,
}: {
  args: TileCameraStressArgs;
  world: World | null;
  controls: MutableRefObject<TileCameraStressArgs>;
  showStrip: boolean;
  isLight: boolean;
  closedStrip: boolean;
  showBothSides: boolean;
  upperSide: 1 | -1;
  stripCanvas: RefObject<HTMLCanvasElement>;
  stripViewport: RefObject<HTMLDivElement>;
  stripPresentation: MutableRefObject<CanvasImageStrip | null>;
  oppositeViewport: RefObject<HTMLDivElement>;
  oppositePresentation: MutableRefObject<CanvasImageStrip | null>;
  oppositeStrip: MutableRefObject<CameraStrip | null>;
  navigationRange: MutableRefObject<readonly [number, number] | null>;
  arrayStrip: MutableRefObject<CameraStrip | null>;
  stripLabelHeight: number;
  setStation: (station: number) => void;
  setElevationOffset: Dispatch<SetStateAction<number>>;
  setStripScrollable: (scrollable: boolean) => void;
}) => {
  useEffect(() => {
    const viewport = stripViewport.current;
    const source = stripCanvas.current;
    if (!showStrip || !viewport || !source) return;
    let lastFollowX: number | undefined;
    let lastFollowWidth: number | undefined;
    const presentation = createCanvasImageStrip(viewport, source, {
      initialRange: () => navigationRange.current,
      onDraw: isLight
        ? undefined
        : (frame) => arrayStrip.current?.setPresentation(frame),
      closedLoop: closedStrip,
      initialView: CANVAS_IMAGE_STRIP_INITIAL_VIEW.FIT,
      ariaLabel: "Pan and zoom camera image strip",
      onViewChange: (view) => {
        oppositePresentation.current?.setView({
          ...view,
          centerY: view.sourceHeight - view.centerY,
        });
        setStation(view.position);
        setStripScrollable(
          view.closedLoop ||
            view.sourceWidth * view.scale > view.viewportWidth + 1
        );
        const path = controls.current.path;
        if (world && (path === "schwebebahn" || path === "urban-street")) {
          const width = view.viewportWidth / view.scale;
          if (lastFollowX !== view.centerX || lastFollowWidth !== width) {
            const target = arrayStrip.current?.getMapViewAt(
              view.centerX,
              width
            );
            if (target) {
              lastFollowX = view.centerX;
              lastFollowWidth = width;
              world.map.easeTo({ ...target, duration: 350 });
            }
          }
        } else if (controls.current.visibleSegments && world) {
          const position = arrayStrip.current?.getScenePositionAt(view.centerX);
          const center = position && world.layer.projectSceneToLngLat(position);
          if (center) world.map.setCenter(center);
        }
      },
      onElevationDelta: isLight
        ? undefined
        : (delta) => {
            // Vertical drag sensitivity follows the currently displayed facade
            // scale; camera-space translation itself belongs to the shared strip.
            const view = presentation.getView();
            const metresPerPixel =
              controls.current.viewHeight /
              Math.max(1, (view.sourceHeight - stripLabelHeight) * view.scale);
            setElevationOffset((value) => value + delta * metresPerPixel);
          },
    });
    stripPresentation.current = presentation;
    const opposite =
      showBothSides && oppositeViewport.current
        ? createCanvasImageStrip(oppositeViewport.current, source, {
            initialRange: () => navigationRange.current,
            onDraw: (frame) => oppositeStrip.current?.setPresentation(frame),
            ariaLabel:
              "Opposite street side · unfolded downward, synchronized station",
            onViewChange: (view) =>
              presentation.setView({
                ...view,
                centerY: view.sourceHeight - view.centerY,
              }),
          })
        : null;
    oppositePresentation.current = opposite;
    return () => {
      if (stripPresentation.current === presentation)
        stripPresentation.current = null;
      presentation.dispose();
      opposite?.dispose();
      if (oppositePresentation.current === opposite)
        oppositePresentation.current = null;
    };
  }, [
    showStrip,
    isLight,
    closedStrip,
    stripLabelHeight,
    args.pairedSides,
    showBothSides,
    upperSide,
    world,
  ]);
};
