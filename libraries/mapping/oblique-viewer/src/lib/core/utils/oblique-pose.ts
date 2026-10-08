import type { ObliqueDataset, ObliqueImageRecord, ObliquePose } from "../types";
import { getCameraCalibration } from "./calibration";
import { computePose } from "./exteriorOrientation";

/** Return the catalog pose, deriving it once only for legacy or partial records. */
export const getOrComputeObliquePose = (
  record: ObliqueImageRecord,
  dataset: ObliqueDataset
): ObliquePose => {
  if (!record.pose) {
    const calibration = getCameraCalibration(dataset, record.cameraId);
    record.pose = computePose(
      record,
      [record.centerWGS84[0], record.centerWGS84[1]],
      calibration.upMapping,
      calibration.imageUpInCamera
    );
  }
  return record.pose;
};
