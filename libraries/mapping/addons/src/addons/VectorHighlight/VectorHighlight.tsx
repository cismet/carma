import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  useMapHighlighting,
  useLassoHighlight,
  DEFAULT_CIRCLE_RADIUS,
  DEFAULT_CIRCLE_RADIUS_STEP,
  DEFAULT_RECT_WIDTH,
  DEFAULT_RECT_HEIGHT,
  DEFAULT_LINE_BUFFER,
  DEFAULT_CLEAR_DELAY,
} from "@carma-mapping/engines/maplibre";
import type {
  DrawShape,
  LassoOperation,
} from "@carma-mapping/engines/maplibre";

import type { AddonComponentProps } from "../../lib/registry";
import { createDimController, type DimController } from "./dim-controller";
import { useCombinedGeometryHighlight } from "./combined-geometry";
import { useHighlightModeActions } from "./highlight-actions";
import { DEFAULT_SHAPES } from "./shapes";

import type { HighlightOperation } from "./operations";
import type { OperationColors } from "./types";

/** invert is the flip the standalone lasso already does, so it maps to toggle */
const LASSO_OPERATIONS: Record<HighlightOperation, LassoOperation> = {
  add: "add",
  subtract: "subtract",
  intersect: "refine",
  invert: "toggle",
};

const DEFAULT_DIM_OPACITY = 0.25;
const DEFAULT_STATE_KEY = "highlighted";
/** cismap's selection border and the basemap keep their paint */
const DEFAULT_EXCLUDED = ["selection", "background"];

/**
 * Headless highlight/dim addon for the MapLibre map. Modifier+click, or a drag
 * with `lasso: true`, toggles features: highlighted ones keep their paint,
 * everything else is dimmed.
 *
 * `useMapHighlighting` owns the `highlighted` feature-state, `useLassoHighlight`
 * the drawing, `createDimController` the dim expression. All UI lives elsewhere:
 * `vectorHighlightControl` for the map-control button, `VectorHighlightShapeTools`
 * for anything the app places itself.
 */
export const VectorHighlight = ({
  config,
  libreMap,
}: AddonComponentProps<"vectorHighlight">) => {
  const {
    modifierClick = "alt",
    dimOpacity = DEFAULT_DIM_OPACITY,
    stateKey = DEFAULT_STATE_KEY,
    excludedLayerPatterns,
    lasso = false,
    monochrome = false,
    operationColors,
    combineLayerGeometries = true,
    excludeCombinedLayers,
    shapes,
    defaultRadius = DEFAULT_CIRCLE_RADIUS,
    defaultRectSize,
    defaultLineBuffer = DEFAULT_LINE_BUFFER,
    clearDelay = DEFAULT_CLEAR_DELAY,
    radiusStep = DEFAULT_CIRCLE_RADIUS_STEP,
  } = config ?? {};

  const {
    mode,
    setMode,
    shape,
    modeActive,
    highlightingActive,
    operation,
    colorForOperation,
    endMode,
    setCircleRadius,
    setRectSize,
  } = useHighlightModeActions();

  const lineBuffer = mode?.lineBuffer ?? defaultLineBuffer;

  // key on the content: route configs pass a fresh array per render
  const shapesKey = (shapes ?? DEFAULT_SHAPES).join(" ");
  const availableShapes = useMemo(
    () => shapesKey.split(" ") as DrawShape[],
    [shapesKey]
  );

  const circleRadius = mode?.circleRadius ?? defaultRadius;
  const configuredWidth = defaultRectSize?.width ?? DEFAULT_RECT_WIDTH;
  const configuredHeight = defaultRectSize?.height ?? DEFAULT_RECT_HEIGHT;
  const stateWidth = mode?.rectSize?.width;
  const stateHeight = mode?.rectSize?.height;
  const rectSize = useMemo(
    () => ({
      width: stateWidth ?? configuredWidth,
      height: stateHeight ?? configuredHeight,
    }),
    [stateWidth, stateHeight, configuredWidth, configuredHeight]
  );

  // the shape list lives in config, so it has to travel through the shared
  // state to reach UI rendered outside this addon
  // key on the content: route configs pass a fresh object per render
  const operationColorsKey = JSON.stringify(operationColors ?? {});
  const publishedColors = useMemo(
    () => JSON.parse(operationColorsKey) as OperationColors,
    [operationColorsKey]
  );

  useEffect(() => {
    setMode((previous) => ({
      ...(previous ?? { isOn: false }),
      availableShapes,
      monochrome,
      operationColors: publishedColors,
      lineBuffer: previous?.lineBuffer ?? defaultLineBuffer,
    }));
  }, [availableShapes, monochrome, publishedColors, defaultLineBuffer, setMode]);


  useMapHighlighting({ map: libreMap, modifierClick, stateKey });

  // the drawing manager remembers the shape, so the toolbar learns from here
  // whether there is one to offer again
  const handleLastShapeChange = useCallback(
    (hasLastShape: boolean) =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        hasLastShape,
      })),
    [setMode]
  );

  // the manager owns whether its preview is up — a new draw or a wipe drops it
  // without the toolbar being asked
  const handleLastShapePreviewChange = useCallback(
    (lastShapeShown: boolean) =>
      setMode((previous) => ({
        ...(previous ?? { isOn: false }),
        lastShapeShown,
      })),
    [setMode]
  );

  // key on the content: route configs pass a fresh array per render
  const excludedCombinedKey = (excludeCombinedLayers ?? [])
    .map((pattern) => pattern.toLowerCase())
    .join(" ");
  const excludedCombined = useMemo(
    () => (excludedCombinedKey ? excludedCombinedKey.split(" ") : []),
    [excludedCombinedKey]
  );
  useCombinedGeometryHighlight(
    libreMap,
    combineLayerGeometries,
    excludedCombined
  );

  const excludedKey = (excludedLayerPatterns ?? DEFAULT_EXCLUDED)
    .map((pattern) => pattern.toLowerCase())
    .join(" ");
  const excluded = useMemo(
    () => (excludedKey ? excludedKey.split(" ") : []),
    [excludedKey]
  );

  // `active` switches between the passive modifier-drag manager and the
  // explicit one that draws on a plain drag while the mode is on
  const { cancelLine, showLastShape, hideLastShape, applyLastShape } =
    useLassoHighlight({
    map: lasso ? libreMap : null,
    active: lasso && (modeActive || highlightingActive),
    shape,
    circleRadius,
    rectSize,
    radiusStep,
    lineBuffer,
    clearDelay,
    onLastShapeChange: handleLastShapeChange,
    onLastShapePreviewChange: handleLastShapePreviewChange,
    onCircleRadiusChange: setCircleRadius,
    onRectSizeChange: setRectSize,
    onDeactivate: endMode,
    // the operation is picked in the layer row, so the Shift and Alt+Shift
    // refine gestures stay disarmed here
    operation: LASSO_OPERATIONS[operation],
    // resolved here, so config overrides and monochrome reach the drawn shape
    color: colorForOperation(operation),
  });

  // open panel: the last shape goes back on the map so the width can be judged
  // against it
  const bufferPanelOpen = mode?.bufferPanelOpen ?? false;
  useEffect(() => {
    if (bufferPanelOpen) {
      showLastShape();
      return () => hideLastShape();
    }
    hideLastShape();
    return undefined;
  }, [bufferPanelOpen, showLastShape, hideLastShape]);

  const showRequest = mode?.showShapeVersion ?? 0;
  const previousShowRequest = useRef(showRequest);
  useEffect(() => {
    if (showRequest === previousShowRequest.current) return;
    previousShowRequest.current = showRequest;
    showLastShape();
  }, [showRequest, showLastShape]);

  const applyRequest = mode?.applyShapeVersion ?? 0;
  const previousApplyRequest = useRef(applyRequest);
  useEffect(() => {
    if (applyRequest === previousApplyRequest.current) return;
    previousApplyRequest.current = applyRequest;
    applyLastShape();
  }, [applyRequest, applyLastShape]);

  // the toolbar asks for the line being drawn to be dropped by bumping a
  // counter, so no callback has to be parked in the shared addon state
  const cancelRequest = mode?.cancelLineVersion ?? 0;
  const previousCancelRequest = useRef(cancelRequest);
  useEffect(() => {
    if (cancelRequest === previousCancelRequest.current) return;
    previousCancelRequest.current = cancelRequest;
    cancelLine();
  }, [cancelRequest, cancelLine]);

  const controllerRef = useRef<DimController | null>(null);
  // so a controller created while the mode is already on installs the
  // expression right away
  const activeRef = useRef(highlightingActive);
  activeRef.current = highlightingActive;

  useEffect(() => {
    if (!libreMap || dimOpacity == null) {
      return;
    }
    const controller = createDimController(libreMap, {
      dimOpacity,
      stateKey,
      excluded,
    });
    controllerRef.current = controller;
    controller.setActive(activeRef.current);
    return () => {
      controllerRef.current = null;
      controller.destroy();
    };
  }, [libreMap, dimOpacity, stateKey, excluded]);

  useEffect(() => {
    controllerRef.current?.setActive(highlightingActive);
  }, [highlightingActive]);

  // publish the mode when a modifier gesture started it; rising edge only, so
  // the teardown below cannot switch it back on
  const previousHighlightingActive = useRef(highlightingActive);
  useEffect(() => {
    const started = !previousHighlightingActive.current && highlightingActive;
    previousHighlightingActive.current = highlightingActive;
    if (started) {
      setMode((previous) => ({ ...(previous ?? {}), isOn: true }));
    }
  }, [highlightingActive, setMode]);

  const previousModeActive = useRef(modeActive);
  useEffect(() => {
    const ended = previousModeActive.current && !modeActive;
    previousModeActive.current = modeActive;
    if (ended && highlightingActive) {
      endMode();
    }
  }, [modeActive, highlightingActive, endMode]);

  // route switch: leave the map in its untouched state
  useEffect(() => () => endMode(), [endMode]);

  return null;
};
