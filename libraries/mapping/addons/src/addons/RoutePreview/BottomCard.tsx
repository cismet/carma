import type { CSSProperties, ReactNode } from "react";

import { Control, type Positions } from "@carma-mapping/map-controls-layout";

import { useNarrow } from "./useNarrow";

/**
 * A card at the bottom of the map for a route-related question: the preview
 * of a route without an info box ("Starten"), the offer to resume a
 * navigation after a reload. White, rounded and shadowed like the pills, one
 * row of content.
 *
 * On a desktop it floats at the bottom centre, anchored to the map the way
 * the instruction card is (see `InstructionCard`). On a phone the bottom-left
 * column (the search, the origin input, the mode picker) spans the map's
 * width, and a floating card lands on top of it. There the card is a row of
 * that column instead, its last one, under the picker, as wide as the inputs:
 * a zero width with a full minimum, the same trick the picker uses, because
 * the column shrink-wraps its items. Order 40 keeps it after the picker (30);
 * an item put in front of the search would remount it.
 */

const BOTTOM_CENTER_STYLE: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: 0,
  transform: "translateX(-50%)",
  pointerEvents: "auto",
};
const UNANCHORED_STYLE: CSSProperties = { pointerEvents: "auto" };

const NARROW_POSITION: Positions = "bottomleft";
const NARROW_ORDER = 40;
const NARROW_ROW_CLASS_NAME = "mt-1.5 w-0 min-w-full";

export type BottomCardProps = {
  children: ReactNode;
  testId?: string;
  /** default bottom centre, and the bottom-left column on a phone */
  position?: Positions;
  order?: number;
};

export const BottomCard = ({
  children,
  testId,
  position: configuredPosition,
  order: configuredOrder,
}: BottomCardProps) => {
  const narrow = useNarrow();
  const position =
    configuredPosition ?? (narrow ? NARROW_POSITION : "bottomcenter");
  const order = configuredOrder ?? (narrow ? NARROW_ORDER : 11);
  const inColumn = position === NARROW_POSITION && narrow;
  return (
    <Control position={position} order={order}>
      <div
        style={
          position === "bottomcenter" ? BOTTOM_CENTER_STYLE : UNANCHORED_STYLE
        }
        className={inColumn ? NARROW_ROW_CLASS_NAME : undefined}
      >
        <div
          className={`flex ${
            inColumn ? "w-full" : "min-w-[260px]"
          } max-w-[calc(100vw-32px)] items-center gap-3 rounded-[10px] bg-white py-2 pl-4 pr-2 text-gray-800 button-shadow`}
          data-test-id={testId}
        >
          {children}
        </div>
      </div>
    </Control>
  );
};
