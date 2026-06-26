// 2D <-> 3D transition phase for the Cesium runtime.
// Lives outside any store: held in CesiumContextProvider state.
export enum CESIUM_RUNTIME_TRANSITION_STATE {
  NONE,
  TO3D,
  TO2D,
}
