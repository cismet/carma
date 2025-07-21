/**
 * Utility functions for line calculations and positioning
 */
import React from "react";

export interface Point {
  x: number;
  y: number;
}

export interface LineProperties {
  length: number;
  angle: number;
  midPoint: Point;
}

/**
 * Calculate line properties between two points
 */
export function calculateLineProperties(
  startPoint: Point,
  endPoint: Point,
  startOffset: number = 0
): LineProperties {
  const deltaX = endPoint.x - startPoint.x;
  const deltaY = endPoint.y - startPoint.y;
  const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const angle = Math.atan2(deltaY, deltaX);

  // Apply start offset if specified
  const effectiveStartX = startPoint.x + Math.cos(angle) * startOffset;
  const effectiveStartY = startPoint.y + Math.sin(angle) * startOffset;
  const effectiveLength = Math.max(0, length - startOffset);

  // Calculate midpoint for positioning (line center should pass through points)
  const midX = effectiveStartX + (deltaX * (effectiveLength / length)) / 2;
  const midY = effectiveStartY + (deltaY * (effectiveLength / length)) / 2;

  return {
    length: effectiveLength,
    angle,
    midPoint: { x: midX, y: midY },
  };
}

/**
 * Calculate distance between two points
 */
export function calculateDistance(point1: Point, point2: Point): number {
  const deltaX = point2.x - point1.x;
  const deltaY = point2.y - point1.y;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

/**
 * Calculate angle between two points in radians
 */
export function calculateAngle(startPoint: Point, endPoint: Point): number {
  const deltaX = endPoint.x - startPoint.x;
  const deltaY = endPoint.y - startPoint.y;
  return Math.atan2(deltaY, deltaX);
}

/**
 * Calculate point along a line at a given distance from start
 */
export function calculatePointAlongLine(
  startPoint: Point,
  endPoint: Point,
  distance: number
): Point {
  const angle = calculateAngle(startPoint, endPoint);
  return {
    x: startPoint.x + Math.cos(angle) * distance,
    y: startPoint.y + Math.sin(angle) * distance,
  };
}

/**
 * Calculate the midpoint between two points
 */
export function calculateMidpoint(point1: Point, point2: Point): Point {
  return {
    x: (point1.x + point2.x) / 2,
    y: (point1.y + point2.y) / 2,
  };
}

/**
 * Universal method to create line styles for connecting arbitrary points
 * This can be used to create CSS styles for lines without using React components
 */
export function createLineStyles(
  startPoint: Point,
  endPoint: Point,
  options: {
    color?: string;
    width?: number;
    opacity?: number;
    dashed?: boolean;
    startOffset?: number;
  } = {}
): React.CSSProperties {
  const {
    color = "white",
    width = 1,
    opacity = 1,
    dashed = false,
    startOffset = 0,
  } = options;

  const { length, angle, midPoint } = calculateLineProperties(
    startPoint,
    endPoint,
    startOffset
  );

  // Return null-like styles if length is too small
  if (length < 0.1) {
    return { display: "none" };
  }

  const baseStyles: React.CSSProperties = {
    position: "absolute",
    left: `${midPoint.x}px`,
    top: `${midPoint.y}px`,
    width: `${length}px`,
    height: `${width}px`,
    backgroundColor: dashed ? "transparent" : color,
    opacity,
    transform: `translate(-50%, -50%) rotate(${angle}rad)`,
    transformOrigin: "center center",
    pointerEvents: "none",
  };

  if (dashed) {
    baseStyles.backgroundImage = `repeating-linear-gradient(
      90deg,
      ${color} 0px,
      ${color} 3px,
      transparent 3px,
      transparent 6px
    )`;
  }

  return baseStyles;
}
