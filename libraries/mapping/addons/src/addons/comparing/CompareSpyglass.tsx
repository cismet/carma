import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { SpyglassOverlay } from "@carma-mapping/core";
import { useMapLayers } from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../../lib/registry";
import { CompareStage } from "./stage/CompareStage";
import { groupLayers, rolesFromAssignments } from "./stage/roles";
import { useComparingActions } from "./comparing-actions";
import { COMPARE_MODE } from "./compare-modes";
import { panelLabelsFor } from "./panel-labels";

export type CompareSpyglassConfig = {
  /** glyph endpoint for the panels' own maps, when the app overrides the default */
  overrideGlyphs?: string;
  /**
   * Whether the hidden app map follows every frame (`live`) or only once a
   * movement settles (`settled`, the default). See `CompareSwipe`.
   */
  appMapSync?: "live" | "settled";
  /**
   * How wide the lens starts, in px, when nothing has been stored yet. Held to
   * the range the lens can be wheeled through.
   */
  radius?: number;
};

/**
 * Which panel is the circle. The other one is everything around it, so the two
 * are not interchangeable and the pane names them accordingly.
 */
const LENS_PANEL = 1;

type Size = { width: number; height: number };
type Point = { x: number; y: number };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Compares two layers by cutting a circle of one into the other and letting the
 * user drag it around.
 *
 * The panels are the ones every other mode uses: two full-size maps on one
 * camera, stacked, differing only in what they were given to draw. The lens is
 * a `clip-path` circle on the upper of the two, so nothing is rendered twice
 * and the ring can be moved without a map ever resizing. `SpyglassOverlay` from
 * the mapping core draws that ring and owns the drag and the wheel, which is
 * the same component the compare playground uses, so both places behave alike.
 *
 * Two panels and no more: a circle shows one map under it, which leaves a third
 * nowhere to go. The shared state holds the mode and the panel count to that,
 * so this never mounts against a layout it cannot draw.
 */
export const CompareSpyglass = ({
  config,
  libreMap,
}: AddonComponentProps<"compareSpyglass">) => {
  const {
    hasState,
    isOn,
    mode,
    orientation,
    panelCount,
    setLayout,
    assignments,
    spyglassRadius,
    setSpyglassRadius,
  } = useComparingActions();
  const isActive = isOn && mode === COMPARE_MODE.spyglass;

  const layers = useMapLayers(libreMap);
  const roles = useMemo(
    () => rolesFromAssignments(layers, assignments ?? {}, panelCount),
    [assignments, layers, panelCount]
  );
  const groupCount = useMemo(() => groupLayers(layers).length, [layers]);

  // the route's config decides how wide the lens starts, and only while there
  // is nothing to start from: a stored radius is a size the user already
  // wheeled to, and seeding over it would undo that on every reload. The same
  // rule the swipe applies to its orientation.
  const seededRadius = useRef(hasState);
  useEffect(() => {
    if (seededRadius.current) {
      return;
    }
    seededRadius.current = true;
    if (config?.radius !== undefined) {
      setSpyglassRadius(config.radius);
    }
  }, [config?.radius, setSpyglassRadius]);

  // the box the panels are drawn in, measured rather than taken from the map:
  // the ring's position is in that box's coordinates and the clip-path is read
  // against the same origin, so both have to come from the same element
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const handleSize = useCallback((next: Size) => {
    setSize((previous) =>
      previous.width === next.width && previous.height === next.height
        ? previous
        : next
    );
  }, []);

  const [position, setPosition] = useState<Point | null>(null);

  // the lens starts in the middle and is kept inside the box when the window
  // changes shape. Leaving the mode drops the position, so coming back puts the
  // lens where it can be found rather than wherever it was left off-screen.
  useEffect(() => {
    if (!isActive) {
      setPosition(null);
      return;
    }
    const { width, height } = size;
    if (width === 0 || height === 0) {
      return;
    }
    setPosition((previous) => {
      if (!previous) {
        return { x: width / 2, y: height / 2 };
      }
      const x = clamp(previous.x, 0, width);
      const y = clamp(previous.y, 0, height);
      return x === previous.x && y === previous.y ? previous : { x, y };
    });
  }, [isActive, size]);

  // only the running mode describes the layout, or the pane's headings would be
  // whichever mode addon rendered last
  useEffect(() => {
    if (!isActive) {
      return;
    }
    setLayout(
      panelCount,
      panelLabelsFor(panelCount, orientation, COMPARE_MODE.spyglass)
    );
  }, [isActive, orientation, panelCount, setLayout]);

  const panelStyles = useMemo<CSSProperties[]>(() => {
    // before the box has been measured the lens has no place to be, and a
    // circle of nothing keeps the upper panel out of the way until it does
    const clipPath = position
      ? `circle(${spyglassRadius}px at ${position.x}px ${position.y}px)`
      : "circle(0px at 0 0)";
    return Array.from({ length: panelCount }, (_, index) =>
      index === LENS_PANEL
        ? {
            position: "absolute" as const,
            inset: 0,
            clipPath,
            WebkitClipPath: clipPath,
            zIndex: 1,
          }
        : { position: "absolute" as const, inset: 0, zIndex: 0 }
    );
  }, [panelCount, position, spyglassRadius]);

  // nothing is mounted while another mode runs. Fewer than two blocks on the
  // map means there is nothing to hold against each other, whatever the
  // assignment says.
  if (!isActive || !libreMap || groupCount < 2 || roles.panels.length < 2) {
    return null;
  }

  return (
    <CompareStage
      appMap={libreMap}
      roles={roles}
      panelStyles={panelStyles}
      overrideGlyphs={config?.overrideGlyphs}
      appMapSync={config?.appMapSync}
    >
      <SpyglassLayer
        position={position}
        radius={spyglassRadius}
        onPositionChange={setPosition}
        onRadiusChange={setSpyglassRadius}
        onSize={handleSize}
      />
    </CompareStage>
  );
};

/**
 * The ring, over the panels and inside the same box they fill.
 *
 * It exists to be measured: the stage owns the container, so the only way to
 * get its size is from something rendered into it. `pointer-events: none` here
 * keeps the map draggable everywhere the ring is not; the overlay's own hit
 * circle opts back in for the part that is the handle.
 */
const SpyglassLayer = ({
  position,
  radius,
  onPositionChange,
  onRadiusChange,
  onSize,
}: {
  position: Point | null;
  radius: number;
  onPositionChange: (position: Point) => void;
  onRadiusChange: (radius: number) => void;
  onSize: (size: Size) => void;
}) => {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    const measure = () => {
      onSize({ width: box.clientWidth, height: box.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => {
      observer.disconnect();
    };
  }, [onSize]);

  return (
    <div
      ref={boxRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      <SpyglassOverlay
        position={position}
        radius={radius}
        onPositionChange={onPositionChange}
        onRadiusChange={onRadiusChange}
      />
    </div>
  );
};
