import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { Snapshot } from "@carma-mapping/show-remote";

import { MODEL_ASPECT } from "./pointer-math";

const LOG_PREFIX = "[PM POSITION]";
const RAD = Math.PI / 180;
/** how far the floor tips away, the table seen from its bottom edge */
const TILT_DEG = 35;
const PERSPECTIVE_PX = 900;
/** room between the table's corners and the circle, in model widths */
const CIRCLE_CLEARANCE = 0.12;
/** room between the circle and the floor's edge, for the mark */
const FLOOR_MARGIN = 0.1;
/** the table top above the floor, in model widths */
const TABLE_HEIGHT = 0.05;
const MAX_SIZE_PX = 420;

type Picture =
  | { status: "loading" }
  | { status: "shown"; image: string; aspect: number }
  | { status: "missing" };

/**
 * A point on the screen, relative to the view's middle, back onto the tipped
 * floor: the inverse of `rotateX(TILT_DEG)` seen through `PERSPECTIVE_PX`,
 * both about the floor's middle. Result in floor pixels, y towards the
 * viewer.
 */
const toFloor = (sx: number, sy: number): [number, number] => {
  const a = TILT_DEG * RAD;
  const d = PERSPECTIVE_PX;
  const v = (sy * d) / (d * Math.cos(a) + sy * Math.sin(a));
  return [(sx * (d - v * Math.sin(a))) / d, v];
};

/**
 * The table from above, slightly tipped, with what the projector shows on it
 * and a circle around it. Tapping or dragging anywhere puts the presenter's
 * mark on the circle at that bearing, see `toTable` for the angle.
 */
export const PositionPicker = ({
  sideDeg,
  requestSnapshot,
  onChange,
  onClose,
}: {
  sideDeg: number;
  requestSnapshot: () => Promise<Snapshot>;
  onChange: (sideDeg: number) => void;
  onClose: () => void;
}) => {
  const viewRef = useRef<HTMLDivElement>(null);
  const [picture, setPicture] = useState<Picture>({ status: "loading" });
  const fetchRef = useRef(0);

  const fetchPicture = useCallback(() => {
    const run = ++fetchRef.current;
    setPicture({ status: "loading" });
    requestSnapshot()
      .then((snapshot) => {
        if (run !== fetchRef.current) {
          return;
        }
        if ("error" in snapshot) {
          console.warn(`${LOG_PREFIX} the display sent no picture`, snapshot);
          setPicture({ status: "missing" });
          return;
        }
        setPicture({
          status: "shown",
          image: snapshot.image,
          aspect: snapshot.width / snapshot.height,
        });
      })
      .catch((error: unknown) => {
        if (run === fetchRef.current) {
          console.warn(`${LOG_PREFIX} no picture`, error);
          setPicture({ status: "missing" });
        }
      });
  }, [requestSnapshot]);

  useEffect(() => {
    fetchPicture();
    return () => {
      // a late answer finds nobody to show it to
      fetchRef.current += 1;
    };
  }, [fetchPicture]);

  const aspect = picture.status === "shown" ? picture.aspect : MODEL_ASPECT;
  const circleRadius = Math.hypot(0.5, 0.5 / aspect) + CIRCLE_CLEARANCE;
  const floorHalf = circleRadius + FLOOR_MARGIN;
  const size = Math.min(window.innerWidth - 48, MAX_SIZE_PX);
  const perWidth = size / (2 * floorHalf);

  const pick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const rect = view.getBoundingClientRect();
    const [x, y] = toFloor(
      event.clientX - (rect.left + rect.width / 2),
      event.clientY - (rect.top + rect.height / 2)
    );
    // too close to the middle to tell a bearing
    if (Math.hypot(x, y) < 0.1 * perWidth) {
      return;
    }
    onChange(Math.atan2(x, y) / RAD);
  };

  const s = Math.sin(sideDeg * RAD);
  const c = Math.cos(sideDeg * RAD);
  const at = (radius: number, across = 0) =>
    `${radius * s + across * c},${radius * c - across * s}`;
  const tableHeight = perWidth / aspect;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Standort"
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950 pt-safe-top-xs"
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
        <h2 className="m-0 flex-1 text-lg font-semibold">Standort</h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-lg bg-neutral-100 px-4 text-sm font-semibold text-neutral-950 active:bg-neutral-300"
        >
          Fertig
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-4 overflow-y-auto px-4 pb-safe-bottom-xs">
        <p className="m-0 self-stretch text-sm leading-relaxed text-neutral-400">
          Die eigene Stelle am Tisch auf dem Kreis antippen oder den Punkt
          dorthin ziehen. Der Zeiger folgt dann dem Handgelenk so, wie man von
          dort auf den Tisch schaut.
        </p>

        <div
          ref={viewRef}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pick(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              pick(event);
            }
          }}
          className="flex touch-none select-none items-center justify-center"
          style={{
            width: size,
            height: size * 0.9,
            perspective: `${PERSPECTIVE_PX}px`,
          }}
        >
          <div
            className="relative shrink-0"
            style={{
              width: size,
              height: size,
              transform: `rotateX(${TILT_DEG}deg)`,
              transformStyle: "preserve-3d",
            }}
          >
            <svg
              viewBox={`${-floorHalf} ${-floorHalf} ${2 * floorHalf} ${
                2 * floorHalf
              }`}
              className="absolute inset-0 h-full w-full"
            >
              <circle
                r={circleRadius}
                fill="none"
                strokeWidth={0.012}
                strokeDasharray="0.03 0.025"
                className="stroke-neutral-600"
              />
              <polygon
                points={`${at(circleRadius - 0.11)} ${at(
                  circleRadius - 0.035,
                  0.035
                )} ${at(circleRadius - 0.035, -0.035)}`}
                className="fill-amber-400"
              />
              <circle
                cx={circleRadius * s}
                cy={circleRadius * c}
                r={0.045}
                strokeWidth={0.012}
                className="fill-amber-400 stroke-neutral-950"
              />
            </svg>
            <div
              className="absolute left-1/2 top-1/2 flex items-start justify-center rounded-sm border border-neutral-500 bg-neutral-700 bg-cover bg-center"
              style={{
                width: perWidth,
                height: tableHeight,
                marginLeft: -perWidth / 2,
                marginTop: -tableHeight / 2,
                transform: `translateZ(${TABLE_HEIGHT * perWidth}px)`,
                transformStyle: "preserve-3d",
                ...(picture.status === "shown"
                  ? { backgroundImage: `url("${picture.image}")` }
                  : {}),
              }}
            >
              {picture.status !== "shown" && (
                <span className="mt-1 text-[10px] uppercase tracking-wide text-neutral-400">
                  Bildoberkante
                </span>
              )}
              <div
                className="absolute left-0 top-full w-full bg-neutral-800"
                style={{
                  height: TABLE_HEIGHT * perWidth,
                  transformOrigin: "top",
                  transform: "rotateX(-90deg)",
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-stretch">
          <p className="m-0 flex-1 text-xs text-neutral-500">
            {picture.status === "loading"
              ? "Bild vom Projektor wird geholt …"
              : picture.status === "missing"
              ? "Kein Bild vom Projektor."
              : null}
          </p>
          <button
            type="button"
            onClick={fetchPicture}
            disabled={picture.status === "loading"}
            className="min-h-[44px] rounded-lg bg-neutral-800 px-4 text-sm active:bg-neutral-700 disabled:opacity-40"
          >
            Neues Bild
          </button>
        </div>
      </div>
    </div>
  );
};
