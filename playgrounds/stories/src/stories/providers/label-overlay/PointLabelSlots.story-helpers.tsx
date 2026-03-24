import { useMemo, useState } from "react";
import { MINUS_PI_OVER_FOUR } from "@carma/math";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";
import {
  PointLabel,
  createPointLabelExpansionSlots,
  createPresetPointLabelExpansionSlots,
  type PointLabelExpansionSlotDescriptor,
  type PointLabelExpansionSlotPreset,
  type PointLabelExpansionSlotStrategy,
} from "@carma-providers/label-overlay";

export type PointLabelSlotsStoryArgs = {
  preset: PointLabelExpansionSlotPreset;
  strategy: PointLabelExpansionSlotStrategy;
  slotCount: number;
  radiusPx: number;
  startAngleDeg: number;
  includeCenter: boolean;
  compareStrategies: boolean;
  labelFontSizePx: number;
  showHelperRing: boolean;
  showStems: boolean;
};

const VIEWBOX_SIZE = 360;
const VIEWBOX_CENTER = VIEWBOX_SIZE / 2;
const ANCHOR_RADIUS_PX = 12;
const CENTER_ANCHOR_MARKER_SIZE_PX = 10;
const FLYOUT_LABEL_DISTANCE_OFFSET_PX = 18;
const COLLAPSED_FLYOUT_SCALE = 0.05;
const RADIAL_FLYOUT_TRANSITION_MS = 110;
const POINT_LABEL_TRANSITION_MS = 110;
const RADIAL_FLYOUT_TRANSITION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const SLOT_LABEL_FONT_FAMILY =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const SLOT_DEMO_COLORS = {
  helperRingStroke: "rgba(148, 163, 184, 0.42)",
  helperGuideStroke: "rgba(251, 113, 133, 0.9)",
  centerAnchorFill: "#0f172a",
  centerAnchorOutline: "rgba(255, 255, 255, 0.92)",
  aggregateFill: "rgba(30, 41, 59, 0.96)",
  aggregateHoverFill: "rgba(51, 65, 85, 0.96)",
  aggregateText: "#f8fafc",
  flyoutFill: "rgba(255, 247, 237, 0.98)",
  flyoutSelectedFill: "rgba(254, 215, 170, 0.98)",
  flyoutHoverFill: "rgba(255, 237, 213, 0.98)",
  flyoutText: "#7c2d12",
  stemStroke: "rgba(180, 83, 9, 0.45)",
} as const;

const formatAngle = (angleRad: number): string =>
  `${(radToDegNumeric(angleRad) ?? 0).toFixed(0)} deg`;

const resolveDemoAttach = (
  slot: PointLabelExpansionSlotDescriptor
): "left" | "right" | "center" => {
  if (slot.isCenter) {
    return "center";
  }

  const normalizedAbsY = Math.abs(Math.sin(slot.angleRad));
  if (normalizedAbsY >= 0.98) {
    return "center";
  }

  return slot.attach;
};

const SlotCanvas = ({
  heading,
  subheading,
  slots,
  radiusPx,
  startAngleRad,
  labelFontSizePx,
  showHelperRing,
  showStems,
}: {
  heading: string;
  subheading: string;
  slots: readonly PointLabelExpansionSlotDescriptor[];
  radiusPx: number;
  startAngleRad: Radians;
  labelFontSizePx: number;
  showHelperRing: boolean;
  showStems: boolean;
}) => {
  const [expanded, setExpanded] = useState(true);
  const sortedSlots = useMemo(
    () => [...slots].sort((left, right) => left.orderIndex - right.orderIndex),
    [slots]
  );
  const flyoutSlots = useMemo(
    () => sortedSlots.filter((slot) => !slot.isCenter),
    [sortedSlots]
  );
  const effectiveFlyoutSlots =
    flyoutSlots.length > 0 ? flyoutSlots : sortedSlots;
  const aggregateCount = effectiveFlyoutSlots.length;
  const resolvedLabelFontSizePx = Math.max(10, Math.round(labelFontSizePx));
  const startGuideX = VIEWBOX_CENTER + Math.cos(startAngleRad) * radiusPx;
  const startGuideY = VIEWBOX_CENTER + Math.sin(startAngleRad) * radiusPx;

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 2,
        }}
      >
        <strong style={{ fontSize: 13 }}>{heading}</strong>
        <span style={{ fontSize: 12, color: "#475569" }}>{subheading}</span>
      </div>
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 420,
          aspectRatio: "1 / 1",
        }}
      >
        <svg
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        >
          {showHelperRing ? (
            <>
              <circle
                cx={VIEWBOX_CENTER}
                cy={VIEWBOX_CENTER}
                r={radiusPx}
                fill="none"
                stroke={SLOT_DEMO_COLORS.helperRingStroke}
                strokeWidth="1.5"
                strokeDasharray="5 6"
              />
              <line
                x1={VIEWBOX_CENTER}
                y1={VIEWBOX_CENTER}
                x2={startGuideX}
                y2={startGuideY}
                stroke={SLOT_DEMO_COLORS.helperGuideStroke}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          ) : null}
        </svg>
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: VIEWBOX_CENTER,
            top: VIEWBOX_CENTER,
            width: CENTER_ANCHOR_MARKER_SIZE_PX,
            height: CENTER_ANCHOR_MARKER_SIZE_PX,
            transform: "translate(-50%, -50%)",
            borderRadius: 9999,
            background: SLOT_DEMO_COLORS.centerAnchorFill,
            boxShadow: `0 0 0 2px ${SLOT_DEMO_COLORS.centerAnchorOutline}`,
            zIndex: 2,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: VIEWBOX_CENTER,
            top: VIEWBOX_CENTER,
            zIndex: 3,
          }}
        >
          <PointLabel
            pointId={`slot-cluster-${heading}`}
            content={`${aggregateCount}`}
            compactContent={`${aggregateCount}`}
            selected={expanded}
            hideMarker
            labelStyle="capsule"
            collapse={!expanded}
            forceCollapse={!expanded}
            compactBorderless
            fullBorder={false}
            labelAttach="center"
            labelAngleRad={0}
            labelDistance={0}
            lineColor={SLOT_DEMO_COLORS.stemStroke}
            lineWidth={0}
            fontFamily={SLOT_LABEL_FONT_FAMILY}
            fontSize={`${resolvedLabelFontSizePx}px`}
            fontWeight={700}
            textColor={SLOT_DEMO_COLORS.aggregateText}
            textBackgroundColor={SLOT_DEMO_COLORS.aggregateFill}
            selectedBackgroundColor={SLOT_DEMO_COLORS.aggregateFill}
            hoverBackgroundColor={SLOT_DEMO_COLORS.aggregateHoverFill}
            markerBackgroundColor={SLOT_DEMO_COLORS.aggregateFill}
            markerTextColor={SLOT_DEMO_COLORS.aggregateText}
            resizeMode="snappy"
            transitionDurationMs={POINT_LABEL_TRANSITION_MS}
            onClick={() => setExpanded((previous) => !previous)}
          />
        </div>
        {effectiveFlyoutSlots.map((slot) => {
          const resolvedAttach = resolveDemoAttach(slot);
          const fullText = `${slot.attach} · ${formatAngle(slot.angleRad)} · ${
            slot.orderIndex + 1
          }`;
          const compactText = `${slot.orderIndex + 1}`;

          return (
            <div
              key={slot.id}
              style={{
                position: "absolute",
                left: VIEWBOX_CENTER,
                top: VIEWBOX_CENTER,
                zIndex: 1,
                transform: `translate(${expanded ? slot.offset.x : 0}px, ${
                  expanded ? slot.offset.y : 0
                }px) scale(${expanded ? 1 : COLLAPSED_FLYOUT_SCALE})`,
                transformOrigin: "0 0",
                transition: `transform ${RADIAL_FLYOUT_TRANSITION_MS}ms ${RADIAL_FLYOUT_TRANSITION_EASING}`,
                willChange: "transform",
                opacity: 1,
                pointerEvents: expanded ? "auto" : "none",
              }}
            >
              <PointLabel
                pointId={`slot-${slot.id}`}
                content={fullText}
                compactContent={compactText}
                selected={expanded}
                hideMarker
                labelStyle="capsule"
                collapse={!expanded}
                forceCollapse={!expanded}
                compactBorderless
                fullBorder={false}
                labelAttach={resolvedAttach}
                labelAngleRad={slot.angleRad}
                labelDistance={expanded ? FLYOUT_LABEL_DISTANCE_OFFSET_PX : 0}
                lineColor={SLOT_DEMO_COLORS.stemStroke}
                lineWidth={showStems && expanded ? 1 : 0}
                fontFamily={SLOT_LABEL_FONT_FAMILY}
                fontSize={`${resolvedLabelFontSizePx}px`}
                fontWeight={600}
                textColor={SLOT_DEMO_COLORS.flyoutText}
                textBackgroundColor={SLOT_DEMO_COLORS.flyoutFill}
                selectedBackgroundColor={SLOT_DEMO_COLORS.flyoutSelectedFill}
                hoverBackgroundColor={SLOT_DEMO_COLORS.flyoutHoverFill}
                markerBackgroundColor={SLOT_DEMO_COLORS.flyoutSelectedFill}
                markerTextColor={SLOT_DEMO_COLORS.flyoutText}
                resizeMode="snappy"
                transitionDurationMs={POINT_LABEL_TRANSITION_MS}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "grid",
          gap: 4,
          fontSize: 12,
          lineHeight: 1.35,
          color: "#0f172a",
        }}
      >
        <div>
          <strong>Start angle:</strong> {formatAngle(startAngleRad)}
        </div>
        <div>
          <strong>Order:</strong> numbering shows fill order, starting from the
          slot nearest the configured start angle.
        </div>
        <div>
          <strong>Interaction:</strong> click the center aggregate to animate
          the compact pills outward along the slot radius while they expand in
          parallel into the full pill through the horizontal middle section.
        </div>
        <div>
          <strong>Center:</strong> the center anchor stays at the exact origin,
          and the anchor marker is layered above the helper ring.
        </div>
      </div>
    </div>
  );
};

const SlotList = ({
  slots,
}: {
  slots: readonly PointLabelExpansionSlotDescriptor[];
}) => (
  <div
    style={{
      display: "grid",
      gap: 4,
      fontSize: 12,
      lineHeight: 1.35,
      color: "#0f172a",
    }}
  >
    {slots.map((slot) => (
      <div
        key={slot.id}
        style={{
          display: "grid",
          gridTemplateColumns: "32px 78px 64px 1fr",
          gap: 8,
          alignItems: "center",
          padding: "4px 0",
          borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
        }}
      >
        <strong>{slot.orderIndex + 1}</strong>
        <span>{slot.isCenter ? "center" : slot.attach}</span>
        <span>{formatAngle(slot.angleRad)}</span>
        <span>
          ({slot.offset.x.toFixed(1)}, {slot.offset.y.toFixed(1)})
        </span>
      </div>
    ))}
  </div>
);

const resolvePresetLabel = (preset: PointLabelExpansionSlotPreset): string => {
  if (preset === "diagonal-4") {
    return "4 diagonal 45 deg slots";
  }
  if (preset === "ring-12") {
    return "12 ring slots";
  }
  return "QGIS / Esri style 9 slots";
};

const resolveStartAngleRad = (startAngleDeg: number): Radians =>
  (degToRadNumeric(startAngleDeg) ?? MINUS_PI_OVER_FOUR) as Radians;

const createSlotsForArgs = (
  args: PointLabelSlotsStoryArgs
): PointLabelExpansionSlotDescriptor[] => {
  const startAngleRad = resolveStartAngleRad(args.startAngleDeg);

  return args.compareStrategies
    ? createPointLabelExpansionSlots({
        slotCount: args.slotCount,
        radiusPx: args.radiusPx,
        startAngleRad,
        includeCenter: args.includeCenter,
        strategy: "equal-angle",
      })
    : createPresetPointLabelExpansionSlots(args.preset, {
        radiusPx: args.radiusPx,
        startAngleRad,
      });
};

export const POINT_LABEL_SLOTS_DEFAULT_ARGS: PointLabelSlotsStoryArgs = {
  preset: "qgis-9",
  strategy: "equal-angle",
  slotCount: 9,
  radiusPx: 120,
  startAngleDeg: -45,
  includeCenter: true,
  compareStrategies: false,
  labelFontSizePx: 12,
  showHelperRing: false,
  showStems: false,
};

export const POINT_LABEL_SLOTS_ARG_TYPES = {
  preset: {
    control: "select",
    options: ["qgis-9", "diagonal-4", "ring-12"],
  },
  strategy: {
    control: "radio",
    options: ["equal-angle", "equal-height-sides"],
  },
  slotCount: {
    control: { type: "range", min: 1, max: 24, step: 1 },
  },
  radiusPx: {
    control: { type: "range", min: 40, max: 180, step: 2 },
  },
  startAngleDeg: {
    control: { type: "range", min: -180, max: 180, step: 5 },
  },
  labelFontSizePx: {
    control: { type: "range", min: 10, max: 26, step: 1 },
  },
  showHelperRing: {
    control: "boolean",
  },
  showStems: {
    control: "boolean",
  },
  includeCenter: {
    control: "boolean",
  },
  compareStrategies: {
    table: {
      disable: true,
    },
  },
};

export const PointLabelSlotPresetStory = ({
  preset,
  radiusPx,
  startAngleDeg,
  labelFontSizePx,
  showHelperRing,
  showStems,
}: PointLabelSlotsStoryArgs) => {
  const startAngleRad = resolveStartAngleRad(startAngleDeg);
  const slots = createPresetPointLabelExpansionSlots(preset, {
    radiusPx,
    startAngleRad,
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 20,
        display: "grid",
        gap: 20,
        background: "#ffffff",
      }}
    >
      <SlotCanvas
        heading={resolvePresetLabel(preset)}
        subheading="Preset exploration for canonical slot families."
        slots={slots}
        radiusPx={radiusPx}
        startAngleRad={startAngleRad}
        labelFontSizePx={labelFontSizePx}
        showHelperRing={showHelperRing}
        showStems={showStems}
      />
      <SlotList slots={slots} />
    </div>
  );
};

export const PointLabelSlotGeneratorStory = ({
  strategy,
  slotCount,
  radiusPx,
  startAngleDeg,
  includeCenter,
  labelFontSizePx,
  showHelperRing,
  showStems,
}: PointLabelSlotsStoryArgs) => {
  const startAngleRad = resolveStartAngleRad(startAngleDeg);
  const slots = createPointLabelExpansionSlots({
    slotCount,
    radiusPx,
    startAngleRad,
    includeCenter,
    strategy,
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 20,
        display: "grid",
        gap: 20,
        background: "#ffffff",
      }}
    >
      <SlotCanvas
        heading="Arbitrary slot generator"
        subheading={`${slotCount} ring slots, ${
          includeCenter ? "with" : "without"
        } center slot.`}
        slots={slots}
        radiusPx={radiusPx}
        startAngleRad={startAngleRad}
        labelFontSizePx={labelFontSizePx}
        showHelperRing={showHelperRing}
        showStems={showStems}
      />
      <SlotList slots={slots} />
    </div>
  );
};

export const PointLabelSlotComparisonStory = ({
  slotCount,
  radiusPx,
  startAngleDeg,
  includeCenter,
  labelFontSizePx,
  showHelperRing,
  showStems,
}: PointLabelSlotsStoryArgs) => {
  const startAngleRad = resolveStartAngleRad(startAngleDeg);
  const equalAngleSlots = createPointLabelExpansionSlots({
    slotCount,
    radiusPx,
    startAngleRad,
    includeCenter,
    strategy: "equal-angle",
  });
  const equalHeightSlots = createPointLabelExpansionSlots({
    slotCount,
    radiusPx,
    startAngleRad,
    includeCenter,
    strategy: "equal-height-sides",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 20,
        display: "grid",
        gap: 24,
        background: "#ffffff",
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 8,
          maxWidth: 860,
          color: "#0f172a",
        }}
      >
        <strong>Strategy comparison</strong>
        <span style={{ fontSize: 12, color: "#475569" }}>
          `equal-height-sides` is highlighted first because it better exposes
          the side-balanced flyout pattern for clustered labels.
        </span>
        <div
          style={{
            display: "inline-flex",
            width: "fit-content",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            background: "rgba(219, 234, 254, 0.72)",
            color: "#1d4ed8",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Recommended focus: equal-height-sides
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gap: 20,
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        <SlotCanvas
          heading="Equal-height sides"
          subheading="Side-balanced circle distribution with constant y-spacing on both sides."
          slots={equalHeightSlots}
          radiusPx={radiusPx}
          startAngleRad={startAngleRad}
          labelFontSizePx={labelFontSizePx}
          showHelperRing={showHelperRing}
          showStems={showStems}
        />
        <SlotCanvas
          heading="Equal-angle"
          subheading="Uniform ring angles, rotated to start at the nearest configured angle."
          slots={equalAngleSlots}
          radiusPx={radiusPx}
          startAngleRad={startAngleRad}
          labelFontSizePx={labelFontSizePx}
          showHelperRing={showHelperRing}
          showStems={showStems}
        />
      </div>
    </div>
  );
};
