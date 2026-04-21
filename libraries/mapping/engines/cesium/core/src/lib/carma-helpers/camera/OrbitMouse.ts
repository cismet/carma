import {
  CESIUM_NADIR_PITCH_RAD,
  fromCarmaViewPitchDegToCesiumPitchRad,
} from "@carma-commons/camera/model";
import { CesiumMath } from "@carma-cesium";
import type { Radians } from "@carma-units";

const OFFSET_NADIR = (CESIUM_NADIR_PITCH_RAD + 0.0001) as Radians;
const DEFAULT_OBLIQUE_PITCH_RAD = fromCarmaViewPitchDegToCesiumPitchRad(45)!;

export enum PITCH {
  HORIZONTAL = 0,
  OBLIQUE = DEFAULT_OBLIQUE_PITCH_RAD,
  ORTHO = CESIUM_NADIR_PITCH_RAD,
}

export const getHeadingPitchForMouseEvent = (
  event: MouseEvent,
  initialMouseX: number,
  initialMouseY: number,
  initialHeading: number,
  initialPitch: number,
  headingFactor: number,
  pitchFactor: number,
  minPitch: number,
  maxPitch: number
): { heading: Radians; pitch: Radians } => {
  const absoluteMinPitch = Math.max(minPitch, OFFSET_NADIR);
  const absoluteMaxPitch = Math.min(maxPitch, 0);
  const deltaX = event.clientX - initialMouseX;
  const deltaY = event.clientY - initialMouseY;
  const headingChange = (deltaX * 0.01 * headingFactor) % CesiumMath.TWO_PI;
  const newHeading = (initialHeading + headingChange) % CesiumMath.TWO_PI;
  const pitchChange = -deltaY * 0.01 * pitchFactor;

  const newPitchRaw = (initialPitch + pitchChange) % CesiumMath.TWO_PI;
  const newPitch = CesiumMath.clamp(
    newPitchRaw,
    absoluteMinPitch,
    absoluteMaxPitch
  );
  return { heading: newHeading as Radians, pitch: newPitch as Radians };
};
