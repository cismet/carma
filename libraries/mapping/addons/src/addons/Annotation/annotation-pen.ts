import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types/types";

/**
 * How the next thing drawn will look, and what draws it. Excalidraw keeps this
 * per instance, so without sharing it every drawing would start again from the
 * defaults — black, thin, selection tool — the moment the pencil moves to it.
 */
export type AnnotationPen = {
  tool: AppState["activeTool"]["type"];
  strokeColor: AppState["currentItemStrokeColor"];
  backgroundColor: AppState["currentItemBackgroundColor"];
  fillStyle: AppState["currentItemFillStyle"];
  strokeWidth: AppState["currentItemStrokeWidth"];
  strokeStyle: AppState["currentItemStrokeStyle"];
  roughness: AppState["currentItemRoughness"];
  roundness: AppState["currentItemRoundness"];
  opacity: AppState["currentItemOpacity"];
  fontFamily: AppState["currentItemFontFamily"];
  fontSize: AppState["currentItemFontSize"];
  textAlign: AppState["currentItemTextAlign"];
  startArrowhead: AppState["currentItemStartArrowhead"];
  endArrowhead: AppState["currentItemEndArrowhead"];
};

export const penFrom = (appState: AppState): AnnotationPen => ({
  tool: appState.activeTool.type,
  strokeColor: appState.currentItemStrokeColor,
  backgroundColor: appState.currentItemBackgroundColor,
  fillStyle: appState.currentItemFillStyle,
  strokeWidth: appState.currentItemStrokeWidth,
  strokeStyle: appState.currentItemStrokeStyle,
  roughness: appState.currentItemRoughness,
  roundness: appState.currentItemRoundness,
  opacity: appState.currentItemOpacity,
  fontFamily: appState.currentItemFontFamily,
  fontSize: appState.currentItemFontSize,
  textAlign: appState.currentItemTextAlign,
  startArrowhead: appState.currentItemStartArrowhead,
  endArrowhead: appState.currentItemEndArrowhead,
});

/**
 * Hands the pen to a scene. `updateScene` touches no camera field, so the
 * change it echoes still matches the camera we last pushed and the map stays
 * where it is; see `useMapSceneSync`.
 */
export const applyPen = (
  api: ExcalidrawImperativeAPI,
  pen: AnnotationPen
): void => {
  api.updateScene({
    appState: {
      currentItemStrokeColor: pen.strokeColor,
      currentItemBackgroundColor: pen.backgroundColor,
      currentItemFillStyle: pen.fillStyle,
      currentItemStrokeWidth: pen.strokeWidth,
      currentItemStrokeStyle: pen.strokeStyle,
      currentItemRoughness: pen.roughness,
      currentItemRoundness: pen.roundness,
      currentItemOpacity: pen.opacity,
      currentItemFontFamily: pen.fontFamily,
      currentItemFontSize: pen.fontSize,
      currentItemTextAlign: pen.textAlign,
      currentItemStartArrowhead: pen.startArrowhead,
      currentItemEndArrowhead: pen.endArrowhead,
    },
  });
  // image opens a file picker on its own, custom is not ours to restore
  if (pen.tool !== "custom" && pen.tool !== "image") {
    api.setActiveTool({ type: pen.tool, locked: true });
  }
};
