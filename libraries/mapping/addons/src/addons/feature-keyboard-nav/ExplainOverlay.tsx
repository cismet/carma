import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Map as MaplibreMap } from "maplibre-gl";

import {
  DEFAULT_ORIGIN_DOT_COLOR,
  DEFAULT_ORIGIN_DOT_OPACITY,
} from "./constants";
import { rotate } from "./geometry";
import type { PickExplanation, ScreenPoint } from "./types";

/**
 * The helper geometry behind one decision, drawn on the map for about a second.
 *
 * It renders the values carried in `PickExplanation` and never recomputes any
 * of them, so what is shown is what the decision used and the two cannot drift
 * apart. The effect of `sharpness` becomes visible rather than implied: the
 * resolved constants are drawn with the picture.
 *
 * Nothing is added to the map style — no source, no layer — so selection,
 * printing and style diffing are untouched. The drawing is an SVG in the map
 * container that never takes pointer events, and it follows the map: the points
 * are kept in lng/lat and re-projected on every `move`, including during the
 * keep-in-view ease.
 */

/** how many candidates are drawn at all; the decision still used every one */
const MAX_DRAWN = 24;
/** how many of those carry their numbers as text */
const MAX_LABELLED = 8;
const AXIS_LENGTH_PX = 90;
const FADE_MS = 400;
/** the origin dot, drawn at the same size in the keypress picture and as the
 *  standing mark on the selected feature: they are the same kind of point */
const ORIGIN_DOT_RADIUS = 5;

export type ExplainSnapshot = {
  /** bumped per keypress; restarts the fade and replaces a held picture */
  id: number;
  explanation: PickExplanation;
  /** the drawn points in lng/lat, so the picture stays on the map */
  anchors: {
    origin: [number, number];
    /** one per evaluation, in the order of `explanation.evaluations` */
    evaluations: Array<[number, number] | undefined>;
    /** one per ray, in the order of `explanation.rays` */
    rays: Array<[number, number] | undefined>;
  };
};

const toLngLat = (
  map: MaplibreMap,
  point: ScreenPoint
): [number, number] | undefined => {
  try {
    const lngLat = map.unproject([point.x, point.y]);
    return [lngLat.lng, lngLat.lat];
  } catch {
    return undefined;
  }
};

/** Freeze one decision into something the overlay can keep re-projecting. */
export const toExplainSnapshot = (
  map: MaplibreMap,
  explanation: PickExplanation,
  id: number
): ExplainSnapshot => ({
  id,
  explanation,
  anchors: {
    origin: toLngLat(map, explanation.originPx) ?? [0, 0],
    evaluations: explanation.evaluations.map((evaluation) =>
      toLngLat(map, evaluation.nearestPointPx)
    ),
    rays: (explanation.rays ?? []).map((ray) =>
      ray.crossingPx ? toLngLat(map, ray.crossingPx) : undefined
    ),
  },
});

/** Re-renders the overlay while the map moves, without touching the snapshot. */
const useMapFrame = (map: MaplibreMap | null) => {
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (!map) return;
    const bump = () => setFrame((value) => value + 1);
    map.on("move", bump);
    map.on("resize", bump);
    return () => {
      map.off("move", bump);
      map.off("resize", bump);
    };
  }, [map]);
};

const COLORS = {
  origin: "#1677ff",
  axis: "#1677ff",
  cone: "#1677ff",
  winner: "#0f9d58",
  candidate: "#8c8c8c",
  rejected: "#d4380d",
  ray: "#722ed1",
};

const format = (value: number) =>
  value >= 100 ? value.toFixed(0) : value.toFixed(1);

export const ExplainOverlay = ({
  map,
  snapshot,
  faded,
}: {
  map: MaplibreMap | null;
  snapshot: ExplainSnapshot | null;
  faded: boolean;
}) => {
  useMapFrame(map);

  if (!map || !snapshot) return null;

  const container = map.getContainer();
  const { explanation, anchors } = snapshot;

  const project = (lngLat: [number, number] | undefined) => {
    if (!lngLat) return undefined;
    const point = map.project(lngLat);
    return { x: point.x, y: point.y };
  };

  const origin = project(anchors.origin);
  if (!origin) return null;

  const { axis } = explanation;
  const axisEnd = {
    x: origin.x + axis.x * AXIS_LENGTH_PX,
    y: origin.y + axis.y * AXIS_LENGTH_PX,
  };

  // the cone is a direction, not a place: it is drawn from the live origin at
  // the resolved half angle rather than stored as two more anchors
  const coneReach = Math.max(
    AXIS_LENGTH_PX,
    ...explanation.evaluations
      .filter((evaluation) => evaluation.rejectedBecause === undefined)
      .map((evaluation) => evaluation.distancePx * 1.15)
  );
  const coneEdge = (sign: number) => {
    const direction = rotate(axis, sign * explanation.coneAngleDeg);
    return {
      x: origin.x + direction.x * coneReach,
      y: origin.y + direction.y * coneReach,
    };
  };

  // drawing limit only: the decision ranked every evaluation, the picture shows
  // the ones near enough to be readable
  const drawn = explanation.evaluations
    .map((evaluation, index) => ({ evaluation, index }))
    .sort((a, b) => a.evaluation.distancePx - b.evaluation.distancePx)
    .slice(0, MAX_DRAWN);

  const isWinner = (key: string) => key === explanation.winnerKey;

  return createPortal(
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 600,
        opacity: faded ? 0 : 1,
        transition: `opacity ${FADE_MS}ms linear`,
      }}
      data-test-id="feature-keyboard-nav-explain"
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {explanation.strategyUsed === "nearest-in-cone" && (
          <polygon
            points={[
              `${origin.x},${origin.y}`,
              `${coneEdge(-1).x},${coneEdge(-1).y}`,
              `${coneEdge(1).x},${coneEdge(1).y}`,
            ].join(" ")}
            fill={COLORS.cone}
            fillOpacity={0.08}
            stroke={COLORS.cone}
            strokeOpacity={0.35}
            strokeDasharray="4 4"
          />
        )}

        {(explanation.rays ?? []).map((ray, index) => {
          const crossing = project(anchors.rays[index]);
          const direction = rotate(axis, ray.angleDeg);
          const end = crossing ?? {
            x: origin.x + direction.x * AXIS_LENGTH_PX * 2,
            y: origin.y + direction.y * AXIS_LENGTH_PX * 2,
          };
          return (
            <g key={`ray-${String(ray.angleDeg)}`}>
              <line
                x1={origin.x}
                y1={origin.y}
                x2={end.x}
                y2={end.y}
                stroke={COLORS.ray}
                strokeWidth={ray.angleDeg === 0 ? 2 : 1}
                strokeOpacity={0.7}
                strokeDasharray={crossing ? undefined : "3 5"}
              />
              {crossing && (
                <circle
                  cx={crossing.x}
                  cy={crossing.y}
                  r={4}
                  fill="none"
                  stroke={COLORS.ray}
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}

        <line
          x1={origin.x}
          y1={origin.y}
          x2={axisEnd.x}
          y2={axisEnd.y}
          stroke={COLORS.axis}
          strokeWidth={2}
        />
        <circle
          cx={origin.x}
          cy={origin.y}
          r={ORIGIN_DOT_RADIUS}
          fill={COLORS.origin}
          stroke="#fff"
          strokeWidth={2}
        />

        {drawn.map(({ evaluation, index }, rank) => {
          const point = project(anchors.evaluations[index]);
          if (!point) return null;
          const winner = isWinner(evaluation.key);
          const color = winner
            ? COLORS.winner
            : evaluation.rejectedBecause
            ? COLORS.rejected
            : COLORS.candidate;
          const label = evaluation.rejectedBecause
            ? evaluation.rejectedBecause
            : `d ${format(evaluation.distancePx)} · θ ${format(
                evaluation.angleDeg
              )}° · ${format(evaluation.cost)}`;
          return (
            <g key={evaluation.key}>
              <line
                x1={origin.x}
                y1={origin.y}
                x2={point.x}
                y2={point.y}
                stroke={color}
                strokeWidth={winner ? 2.5 : 1}
                strokeOpacity={winner ? 0.9 : 0.4}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={winner ? 6 : 3}
                fill={winner ? color : "#fff"}
                stroke={color}
                strokeWidth={winner ? 2 : 1.5}
              />
              {(winner || rank < MAX_LABELLED) && (
                <text
                  x={point.x + 8}
                  y={point.y - 6}
                  fontSize={winner ? 12 : 10}
                  fontWeight={winner ? 700 : 400}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>,
    container
  );
};

/**
 * The interior point of the selected feature, as a blue dot.
 *
 * Its own overlay, not part of the per-keypress picture: it answers "where does
 * a step from here start?", which is a property of the selection rather than of
 * one decision. It therefore appears with the selection, whether that came from
 * a click or from an arrow key, and stays while the user pans.
 *
 * One dot, not one per visible shape. The layer is re-projected on every map
 * frame, and a viewport of ALKIS parcels holds thousands of them, so drawing an
 * interior point per candidate stalled the main thread while panning.
 *
 * Same size and same blue as the origin dot in the keypress picture, because it
 * is the same point. Colour and opacity stay config, since what reads as clear
 * depends on the basemap under it; opacity sits on the layer rather than on the
 * circle so both paths look identical.
 */
export const FeatureOriginDots = ({
  map,
  origins,
  color = DEFAULT_ORIGIN_DOT_COLOR,
  opacity = DEFAULT_ORIGIN_DOT_OPACITY,
}: {
  map: MaplibreMap | null;
  origins: Array<[number, number]>;
  color?: string;
  opacity?: number;
}) => {
  useMapFrame(map);

  if (!map || origins.length === 0) return null;

  return createPortal(
    <svg
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 599,
        opacity,
      }}
      data-test-id="feature-keyboard-nav-origins"
    >
      {origins.map((lngLat, index) => {
        const point = map.project(lngLat);
        return (
          <circle
            key={`feature-origin-${index}`}
            cx={point.x}
            cy={point.y}
            r={ORIGIN_DOT_RADIUS}
            fill={color}
            stroke="#fff"
            strokeWidth={1.5}
          />
        );
      })}
    </svg>,
    map.getContainer()
  );
};

/**
 * The constants that were in force, as a readout.
 *
 * Separate from the drawing because it belongs somewhere else on screen: the
 * picture is anchored to the geometry, this is a caption. The host puts it in
 * the control layout, where it lines up with the other map chrome instead of
 * landing on top of the gazetteer search box in the bottom-left corner.
 */
export const ExplainLegend = ({
  snapshot,
  faded,
  degraded = false,
}: {
  snapshot: ExplainSnapshot | null;
  faded: boolean;
  degraded?: boolean;
}) => {
  if (!snapshot) return null;
  const { explanation } = snapshot;

  return (
    <div
      style={{
        padding: "4px 10px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.9)",
        font: "11px/1.4 monospace",
        color: "#333",
        whiteSpace: "nowrap",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        pointerEvents: "none",
        opacity: faded ? 0 : 1,
        transition: `opacity ${FADE_MS}ms linear`,
      }}
      data-test-id="feature-keyboard-nav-explain-legend"
    >
      {explanation.strategyUsed} · θmax {format(explanation.coneAngleDeg)}° · w{" "}
      {format(explanation.angleWeight)} · p {format(explanation.anglePower)} ·{" "}
      {explanation.evaluations.length} Kandidaten
      {degraded && (
        <span style={{ color: COLORS.rejected }}>
          {" "}
          · Kandidatenmenge unvollständig
        </span>
      )}
    </div>
  );
};
