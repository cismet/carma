import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { Map as MaplibreMap } from "maplibre-gl";

import { useCameraRestriction } from "@carma-mapping/engines/maplibre";

import {
  getLibre3d,
  getLibre3dTransition,
  setLibre3d,
  setLibre3dTransition,
} from "../../store/slices/ui";

const ENTER_3D_PITCH = 60;

/**
 * Terrain is on and has a tile under the center. Until then MapLibre reports
 * exactly 0 there (even with the source loaded, the terrain mesh lags a
 * frame). shortcut: treats a real 0 m ground as missing; fine for Wuppertal,
 * revisit if the 3D mode serves terrain at sea level.
 */
const isGroundKnown = (map: MaplibreMap) => {
  if (!map.getTerrain()) return false;
  const ground = map.queryTerrainElevation(map.getCenter());
  return ground !== null && ground !== 0;
};

/**
 * Put the map's center on the terrain under it. MapLibre only updates the
 * center elevation when a terrain tile arrives; tiles from the cache arrive
 * before terrain is switched on and never do, which leaves the center at sea
 * level under a ground 150 m higher: the camera looks zoomed in and tilts
 * around a point below ground. Zoom is kept, so the camera rises with it and
 * the flat view does not change.
 */
const anchorCenterToGround = (map: MaplibreMap) => {
  // a jump would cut a running flight short
  if (!isGroundKnown(map) || map.isMoving()) return;
  const ground = map.queryTerrainElevation(map.getCenter()) as number;
  if (Math.abs(ground - map.getCenterElevation()) < 1) return;
  map.setCenterElevation(ground);
};
const CAMERA_DURATION_MS = 1500;

/**
 * The 3D button on the maplibre map: switches the maplibre 3D mode (see
 * `useLibreLayers`) instead of handing over to Cesium.
 *
 * Entering lays the 3D background on the 2D one, so the map never goes
 * blank. The camera tilts as soon as the ground under the center is known
 * (see `anchorCenterToGround`); the 2D background is dropped only once the
 * tilt is done and the map has loaded, because swapping styles stalls the
 * main thread and would make the tilt jump.
 * Leaving hides the 3D background and puts the 2D one back first, then
 * flattens the camera, and only then drops the 3D layers, which keep the
 * camera free until it is flat.
 */
export const useLibre3dToggle = (map: MaplibreMap | null) => {
  const dispatch = useDispatch();
  const libre3d = useSelector(getLibre3d);
  const transition = useSelector(getLibre3dTransition);
  // free = the 3D layers are on the map (camera restriction lifted)
  const cameraRestricted = useCameraRestriction(map)?.restricted ?? true;

  const entering = libre3d && transition;
  // terrain may come before the camera is free (a mesh asks for it itself)
  useEffect(() => {
    if (!map || !entering) {
      return;
    }
    const anchor = () => anchorCenterToGround(map);
    anchor();
    map.on("terrain", anchor);
    map.on("render", anchor);
    return () => {
      map.off("terrain", anchor);
      map.off("render", anchor);
    };
  }, [map, entering]);

  useEffect(() => {
    if (!map || !entering || cameraRestricted) {
      return;
    }
    let tilted = false;
    const dropBackground2d = () => {
      map.once("idle", () => dispatch(setLibre3dTransition(false)));
    };
    const tryTilt = (event?: { type?: string }) => {
      if (tilted) return;
      // without terrain there is nothing to wait for but the load itself
      if (!isGroundKnown(map) && event?.type !== "idle") return;
      tilted = true;
      anchorCenterToGround(map);
      // a camera that is already tilted (e.g. from a link) keeps its view
      if (map.getPitch() !== 0) {
        dropBackground2d();
        return;
      }
      map.once("moveend", dropBackground2d);
      map.easeTo({ pitch: ENTER_3D_PITCH, duration: CAMERA_DURATION_MS });
    };
    tryTilt();
    map.on("terrain", tryTilt);
    map.on("render", tryTilt);
    map.on("idle", tryTilt);
    return () => {
      map.off("terrain", tryTilt);
      map.off("render", tryTilt);
      map.off("idle", tryTilt);
    };
  }, [map, entering, cameraRestricted, dispatch]);

  const toggle = useCallback(() => {
    if (libre3d) {
      dispatch(setLibre3dTransition(true));
      dispatch(setLibre3d(false));
      const leave = () => dispatch(setLibre3dTransition(false));
      if (!map || (map.getPitch() === 0 && map.getBearing() === 0)) {
        leave();
        return;
      }
      // start once the restyle is applied: it stalls the main thread, and a
      // flight started before it would skip half its frames
      map.once("styledata", () =>
        requestAnimationFrame(() => {
          map.once("moveend", leave);
          map.easeTo({ pitch: 0, bearing: 0, duration: CAMERA_DURATION_MS });
        })
      );
      return;
    }
    dispatch(setLibre3dTransition(true));
    dispatch(setLibre3d(true));
  }, [dispatch, libre3d, map]);

  return { libre3d, toggle };
};
