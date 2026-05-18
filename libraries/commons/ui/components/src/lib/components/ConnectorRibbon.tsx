import { useId, type CSSProperties } from "react";

// Story: ../../../../../../../playgrounds/stories/src/stories/common/ui/ConnectorRibbon.stories.tsx

export type ConnectorRibbonAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ConnectorRibbonCurveMode = "bezier" | "spline" | "linear";

export type ConnectorRibbonProps = {
  top: ConnectorRibbonAnchor;
  bottom: ConnectorRibbonAnchor;
  color: string;
  capEdgeOpacity?: number;
  zIndex?: number;
  topPadding?: number;
  bottomPadding?: number;
  controlOffsetFactor?: number;
  curveMode?: ConnectorRibbonCurveMode;
};

type RibbonPathPart = {
  key: string;
  top: number;
  height: number;
  clipPath: string;
  svgPath: string;
  fade?: "top" | "bottom";
};

const DEFAULT_Z_INDEX = 0;
const DEFAULT_PADDING = 0;
const DEFAULT_CAP_EDGE_OPACITY = 0;
const DEFAULT_CONTROL_OFFSET_FACTOR = 1;
const DEFAULT_CURVE_MODE: ConnectorRibbonCurveMode = "bezier";
const QUARTER_CIRCLE_CONTROL_RATIO = 0.5522847498307936;

const supportsCssShapeClipPath = () =>
  typeof CSS !== "undefined" &&
  CSS.supports?.("clip-path", "shape(from 0px 0px, line to 1px 1px)") === true;

const clampRadius = (radius: number, width: number) =>
  Math.max(0, Math.min(radius, width / 2));

const resolveControlPointOffsets = ({
  topHalfHeight,
  bottomHalfHeight,
  factor,
}: {
  topHalfHeight: number;
  bottomHalfHeight: number;
  factor: number | undefined;
}) => {
  const offsetFactor = Math.max(0, factor ?? DEFAULT_CONTROL_OFFSET_FACTOR);

  return {
    topOffset: topHalfHeight * offsetFactor,
    bottomOffset: bottomHalfHeight * offsetFactor,
  };
};

const clampSplineEndpointOffset = (offset: number, middleHeight: number) =>
  Math.min(offset, middleHeight / 2);

const resolveSplineSide = ({
  topX,
  bottomX,
  height,
}: {
  topX: number;
  bottomX: number;
  height: number;
}) => {
  const midX = (topX + bottomX) / 2;
  const midY = height / 2;
  const handleX = (bottomX - topX) / 6;

  return {
    midX,
    midY,
    beforeMidControlX: midX - handleX,
    beforeMidControlY: midY,
    afterMidControlX: midX + handleX,
    afterMidControlY: midY,
  };
};

const resolveMiddleClipPath = ({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  height,
  topControlOffset,
  bottomControlOffset,
  curveMode,
}: {
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
  height: number;
  topControlOffset: number;
  bottomControlOffset: number;
  curveMode: ConnectorRibbonCurveMode;
}) => {
  if (curveMode === "linear") {
    return `shape(from ${topLeft}px 0px, line to ${topRight}px 0px, line to ${bottomRight}px ${height}px, line to ${bottomLeft}px ${height}px, close)`;
  }

  if (curveMode === "spline") {
    const right = resolveSplineSide({
      topX: topRight,
      bottomX: bottomRight,
      height,
    });
    const left = resolveSplineSide({
      topX: topLeft,
      bottomX: bottomLeft,
      height,
    });
    const topOffset = clampSplineEndpointOffset(topControlOffset, height);
    const bottomOffset = clampSplineEndpointOffset(bottomControlOffset, height);

    return `shape(from ${topLeft}px 0px, line to ${topRight}px 0px, curve to ${
      right.midX
    }px ${right.midY}px with ${topRight}px ${topOffset}px / ${
      right.beforeMidControlX
    }px ${
      right.beforeMidControlY
    }px, curve to ${bottomRight}px ${height}px with ${
      right.afterMidControlX
    }px ${right.afterMidControlY}px / ${bottomRight}px ${
      height - bottomOffset
    }px, line to ${bottomLeft}px ${height}px, curve to ${left.midX}px ${
      left.midY
    }px with ${bottomLeft}px ${height - bottomOffset}px / ${
      left.afterMidControlX
    }px ${left.afterMidControlY}px, curve to ${topLeft}px 0px with ${
      left.beforeMidControlX
    }px ${left.beforeMidControlY}px / ${topLeft}px ${topOffset}px, close)`;
  }

  const controlEndY = height - bottomControlOffset;

  return `shape(from ${topLeft}px 0px, line to ${topRight}px 0px, curve to ${bottomRight}px ${height}px with ${topRight}px ${topControlOffset}px / ${bottomRight}px ${controlEndY}px, line to ${bottomLeft}px ${height}px, curve to ${topLeft}px 0px with ${bottomLeft}px ${controlEndY}px / ${topLeft}px ${topControlOffset}px, close)`;
};

const resolveMiddleSvgPath = ({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  height,
  topControlOffset,
  bottomControlOffset,
  curveMode,
}: {
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
  height: number;
  topControlOffset: number;
  bottomControlOffset: number;
  curveMode: ConnectorRibbonCurveMode;
}) => {
  if (curveMode === "linear") {
    return `
      M ${topLeft},0
      L ${topRight},0
      L ${bottomRight},${height}
      L ${bottomLeft},${height}
      Z
    `;
  }

  if (curveMode === "spline") {
    const right = resolveSplineSide({
      topX: topRight,
      bottomX: bottomRight,
      height,
    });
    const left = resolveSplineSide({
      topX: topLeft,
      bottomX: bottomLeft,
      height,
    });
    const topOffset = clampSplineEndpointOffset(topControlOffset, height);
    const bottomOffset = clampSplineEndpointOffset(bottomControlOffset, height);

    return `
      M ${topLeft},0
      L ${topRight},0
      C ${topRight},${topOffset} ${right.beforeMidControlX},${
      right.beforeMidControlY
    } ${right.midX},${right.midY}
      C ${right.afterMidControlX},${right.afterMidControlY} ${bottomRight},${
      height - bottomOffset
    } ${bottomRight},${height}
      L ${bottomLeft},${height}
      C ${bottomLeft},${height - bottomOffset} ${left.afterMidControlX},${
      left.afterMidControlY
    } ${left.midX},${left.midY}
      C ${left.beforeMidControlX},${
      left.beforeMidControlY
    } ${topLeft},${topOffset} ${topLeft},0
      Z
    `;
  }

  const controlEndY = height - bottomControlOffset;

  return `
    M ${topLeft},0
    L ${topRight},0
    C ${topRight},${topControlOffset} ${bottomRight},${controlEndY} ${bottomRight},${height}
    L ${bottomLeft},${height}
    C ${bottomLeft},${controlEndY} ${topLeft},${topControlOffset} ${topLeft},0
    Z
  `;
};

const resolveTopCapClipPath = ({
  left,
  right,
  height,
  radius,
}: {
  left: number;
  right: number;
  height: number;
  radius: number;
}) => {
  const horizontalLeft = left + radius;
  const horizontalRight = right - radius;
  const controlOffset = radius * QUARTER_CIRCLE_CONTROL_RATIO;

  return `shape(from ${horizontalLeft}px 0px, line to ${horizontalRight}px 0px, curve to ${right}px ${height}px with ${
    horizontalRight + controlOffset
  }px 0px / ${right}px ${
    height - controlOffset
  }px, line to ${left}px ${height}px, curve to ${horizontalLeft}px 0px with ${left}px ${
    height - controlOffset
  }px / ${horizontalLeft - controlOffset}px 0px, close)`;
};

const resolveTopCapSvgPath = ({
  left,
  right,
  height,
  radius,
}: {
  left: number;
  right: number;
  height: number;
  radius: number;
}) => {
  const horizontalLeft = left + radius;
  const horizontalRight = right - radius;
  const controlOffset = radius * QUARTER_CIRCLE_CONTROL_RATIO;

  return `
    M ${horizontalLeft},0
    L ${horizontalRight},0
    C ${horizontalRight + controlOffset},0 ${right},${
    height - controlOffset
  } ${right},${height}
    L ${left},${height}
    C ${left},${height - controlOffset} ${
    horizontalLeft - controlOffset
  },0 ${horizontalLeft},0
    Z
  `;
};

const resolveBottomCapClipPath = ({
  left,
  right,
  height,
  radius,
}: {
  left: number;
  right: number;
  height: number;
  radius: number;
}) => {
  const horizontalLeft = left + radius;
  const horizontalRight = right - radius;
  const controlOffset = radius * QUARTER_CIRCLE_CONTROL_RATIO;

  return `shape(from ${right}px 0px, curve to ${horizontalRight}px ${height}px with ${right}px ${controlOffset}px / ${
    horizontalRight + controlOffset
  }px ${height}px, line to ${horizontalLeft}px ${height}px, curve to ${left}px 0px with ${
    horizontalLeft - controlOffset
  }px ${height}px / ${left}px ${controlOffset}px, close)`;
};

const resolveBottomCapSvgPath = ({
  left,
  right,
  height,
  radius,
}: {
  left: number;
  right: number;
  height: number;
  radius: number;
}) => {
  const horizontalLeft = left + radius;
  const horizontalRight = right - radius;
  const controlOffset = radius * QUARTER_CIRCLE_CONTROL_RATIO;

  return `
    M ${right},0
    C ${right},${controlOffset} ${
    horizontalRight + controlOffset
  },${height} ${horizontalRight},${height}
    L ${horizontalLeft},${height}
    C ${
      horizontalLeft - controlOffset
    },${height} ${left},${controlOffset} ${left},0
    Z
  `;
};

export const ConnectorRibbon = ({
  top,
  bottom,
  color,
  capEdgeOpacity = DEFAULT_CAP_EDGE_OPACITY,
  zIndex = DEFAULT_Z_INDEX,
  topPadding = DEFAULT_PADDING,
  bottomPadding = DEFAULT_PADDING,
  controlOffsetFactor,
  curveMode = DEFAULT_CURVE_MODE,
}: ConnectorRibbonProps) => {
  const ribbonId = useId().replace(/:/g, "");
  const topAnchorLeft = top.x - topPadding;
  const topAnchorRight = top.x + top.width + topPadding;
  const bottomAnchorLeft = bottom.x - bottomPadding;
  const bottomAnchorRight = bottom.x + bottom.width + bottomPadding;
  const ribbonLeft = Math.min(topAnchorLeft, bottomAnchorLeft);
  const ribbonRight = Math.max(topAnchorRight, bottomAnchorRight);
  const ribbonWidth = ribbonRight - ribbonLeft;
  const topCenterY = top.y + top.height / 2;
  const bottomCenterY = bottom.y + bottom.height / 2;
  const middleHeight = bottomCenterY - topCenterY;

  if (middleHeight <= 0 || ribbonWidth <= 0) {
    return null;
  }

  const topLeft = topAnchorLeft - ribbonLeft;
  const topRight = topAnchorRight - ribbonLeft;
  const bottomLeft = bottomAnchorLeft - ribbonLeft;
  const bottomRight = bottomAnchorRight - ribbonLeft;
  const { topOffset, bottomOffset } = resolveControlPointOffsets({
    topHalfHeight: top.height / 2,
    bottomHalfHeight: bottom.height / 2,
    factor: controlOffsetFactor,
  });
  const middlePathArgs = {
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
    height: middleHeight,
    topControlOffset: topOffset,
    bottomControlOffset: bottomOffset,
    curveMode,
  };
  const parts: RibbonPathPart[] = [
    {
      key: "middle",
      top: topCenterY,
      height: middleHeight,
      clipPath: resolveMiddleClipPath(middlePathArgs),
      svgPath: resolveMiddleSvgPath(middlePathArgs),
    },
  ];

  const topCapHeight = top.height / 2;

  const topCapRadius = clampRadius(topCapHeight, topRight - topLeft);

  if (topCapHeight > 0 && topCapRadius > 0) {
    const topCapArgs = {
      left: topLeft,
      right: topRight,
      height: topCapHeight,
      radius: topCapRadius,
    };

    parts.unshift({
      key: "top",
      top: top.y,
      height: topCapHeight,
      clipPath: resolveTopCapClipPath(topCapArgs),
      svgPath: resolveTopCapSvgPath(topCapArgs),
      fade: "top",
    });
  }

  const bottomCapHeight = bottom.height / 2;
  const bottomCapRadius = clampRadius(
    bottomCapHeight,
    bottomRight - bottomLeft
  );

  if (bottomCapHeight > 0 && bottomCapRadius > 0) {
    const bottomCapArgs = {
      left: bottomLeft,
      right: bottomRight,
      height: bottomCapHeight,
      radius: bottomCapRadius,
    };

    parts.push({
      key: "bottom",
      top: bottomCenterY,
      height: bottomCapHeight,
      clipPath: resolveBottomCapClipPath(bottomCapArgs),
      svgPath: resolveBottomCapSvgPath(bottomCapArgs),
      fade: "bottom",
    });
  }

  const renderShapePart = ({
    key,
    top: partTop,
    height,
    clipPath,
    fade,
  }: RibbonPathPart) => {
    const maskImage =
      fade === "top"
        ? `linear-gradient(to bottom, rgba(0, 0, 0, ${capEdgeOpacity}) 0%, #000 100%)`
        : fade === "bottom"
        ? `linear-gradient(to bottom, #000 0%, rgba(0, 0, 0, ${capEdgeOpacity}) 100%)`
        : undefined;
    const clipStyle: CSSProperties = {
      zIndex,
      left: ribbonLeft,
      top: partTop,
      width: ribbonWidth,
      height,
      backgroundColor: color,
      clipPath,
      WebkitClipPath: clipPath,
      maskImage,
      WebkitMaskImage: maskImage,
    };

    return (
      <div
        key={key}
        className="absolute pointer-events-none"
        data-connector-ribbon="shape"
        data-connector-ribbon-part={key}
        style={clipStyle}
      />
    );
  };

  const renderSvgPart = ({
    key,
    top: partTop,
    height,
    svgPath,
    fade,
  }: RibbonPathPart) => {
    const gradientId = `connector-ribbon-${ribbonId}-${key}`;
    const fill = fade === undefined ? color : `url(#${gradientId})`;

    return (
      <svg
        key={key}
        className="absolute pointer-events-none"
        data-connector-ribbon="svg"
        data-connector-ribbon-part={key}
        style={{
          zIndex,
          left: ribbonLeft,
          top: partTop,
          width: ribbonWidth,
          height,
          overflow: "visible",
        }}
      >
        {fade !== undefined ? (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={color}
                stopOpacity={fade === "top" ? capEdgeOpacity : 1}
              />
              <stop
                offset="100%"
                stopColor={color}
                stopOpacity={fade === "bottom" ? capEdgeOpacity : 1}
              />
            </linearGradient>
          </defs>
        ) : null}
        <path d={svgPath} fill={fill} />
      </svg>
    );
  };

  return (
    <>
      {parts.map(supportsCssShapeClipPath() ? renderShapePart : renderSvgPart)}
    </>
  );
};

export default ConnectorRibbon;
