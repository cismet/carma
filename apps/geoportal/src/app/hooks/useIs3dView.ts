import { useSelector } from "react-redux";

import { getLibre3d } from "../store/slices/ui";

/**
 * Whether the map shows the maplibre 3D view. UI that only cares about "3D"
 * (labels, disabled 2D tools) reads this.
 */
export const useIs3dView = (): boolean => useSelector(getLibre3d);
