export type TileDiagnostics = typeof import("./tile-diagnostics");
/** No diagnostic renderer, worker or geometry capture is loaded until requested. */
export const loadTileDiagnostics = () => import("./tile-diagnostics");
