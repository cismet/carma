// Re-export Math utilities from Cesium
import { Math } from "cesium";

// Avoid name conflict with Math from units
export { Math as CesiumMath };
