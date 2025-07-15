import {
  Cartesian2,
  Cartesian3,
  Cartesian4,
  Color,
  Entity,
  HorizontalOrigin,
  LabelGraphics,
  LabelStyle,
  Matrix4,
  NearFarScalar,
  VerticalOrigin,
  type Viewer,
  SceneTransforms,
  Transforms,
} from "cesium";
import { GeomPoint, MeasurementEntry } from "../types/MeasurementTypes";
import { normalizeOptions } from "@carma-commons/utils";
import { formatDistance } from "../../utils/formatters";
export const SCALE_BY_DISTANCE = new NearFarScalar(0, 1, 5000, 0.0);
export const SCALE_BY_DISTANCE_POINTS = new NearFarScalar(0, 1, 5000, 0.5);

const LABEL_FONT_FAMILY = '"Helvetica Neue", Arial, Helvetica, sans-serif';
export const LABEL_FONT = `10px ${LABEL_FONT_FAMILY}`;
const LABEL_FONT_LARGER = `12px ${LABEL_FONT_FAMILY}`;

const ENCLOSED_GLYPHS =
  "⓪①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿";

/**
 * Formats a number into an enclosed (circled) string.
 *
 * This function uses single Unicode glyphs for integers from 0 to 50.
 * For numbers outside this range, it falls back to a digit-by-digit
 * conversion (e.g., 51 becomes '⑤①'). The input number is rounded to the
 * nearest integer.
 *
 * @param {number} num The number to format.
 * @returns {string} The formatted string with enclosed characters.
 *
 * @example
 * formatNumberToEnclosed(7);   // '⑦'
 * formatNumberToEnclosed(25);  // '㉕'
 * formatNumberToEnclosed(50);  // '㊿'
 * formatNumberToEnclosed(51);  // '⑤①'
 * formatNumberToEnclosed(123); // '①②③'
 * formatNumberToEnclosed(-10); // '-①⓪'
 * formatNumberToEnclosed(19.8); // '⑳' (rounds to 20)
 */
export const formatNumberToEnclosed = (num: number): string => {
  const roundedNum = Math.round(num);

  // Case 1: The number is within the single-glyph range (0-50).
  // We can directly index into the string.
  if (roundedNum >= 0 && roundedNum < ENCLOSED_GLYPHS.length) {
    return ENCLOSED_GLYPHS[roundedNum];
  }

  // Case 2: Fallback for numbers > 50 or negative numbers.
  // We convert each digit using the same lookup string.
  return roundedNum
    .toString()
    .split("")
    .map((char) => ENCLOSED_GLYPHS[Number(char)] || char)
    .join("");
};

type LabelOptions = LabelGraphics.ConstructorOptions;

const defaultLabelOptions: LabelOptions = {
  show: true,
  text: "n/a",
  font: LABEL_FONT,
  fillColor: Color.BLACK,
  showBackground: false,
  //backgroundColor: Color.BLACK.withAlpha(0.5),
  //backgroundPadding: new Cartesian2(12, 6),
  outlineColor: Color.WHITE,
  outlineWidth: 5,
  style: LabelStyle.FILL_AND_OUTLINE,
  pixelOffset: new Cartesian2(5, -8),
  //scaleByDistance: SCALE_BY_DISTANCE,
  //disableDepthTestDistance: Number.POSITIVE_INFINITY,
  horizontalOrigin: HorizontalOrigin.LEFT,
  verticalOrigin: VerticalOrigin.BASELINE,
};

export const createLabelEntity = (
  { id, name, geometryECEF }: MeasurementEntry,
  position?: Cartesian3,
  options?: LabelOptions
) => {
  const label: LabelOptions = normalizeOptions(options, defaultLabelOptions);

  // If no position is provided, use the geometryECEF as position as Fallback
  if (!position) {
    position = Array.isArray(geometryECEF) ? geometryECEF[0] : geometryECEF;
  }

  const entity = new Entity({ id, name, position, label });
  return entity;
};

export const createSegmentLabel = (
  startPoint: Cartesian3,
  endPoint: Cartesian3,
  segmentDistance: number,
  id?: string
): Entity => {
  const labelText = formatDistance(segmentDistance);
  const midpoint = Cartesian3.midpoint(startPoint, endPoint, new Cartesian3());

  const measurementEntry = {
    id: id || `measurement-segment-${Date.now()}-${Math.random()}`,
    name: `Segment ${labelText}`,
    geometryECEF: midpoint,
  } as MeasurementEntry;

  const labelOptions: LabelOptions = {
    text: labelText,
    pixelOffset: new Cartesian2(0, 20), // Above the segment midpoint
    verticalOrigin: VerticalOrigin.CENTER,
    horizontalOrigin: HorizontalOrigin.CENTER,
    eyeOffset: new Cartesian3(0, 0, 0), // Default depth
  };

  return createLabelEntity(measurementEntry, midpoint, labelOptions);
};

export const createSegmentNodeLabel = (
  position: Cartesian3,
  positionGeographic: GeomPoint,
  pointIndex: number,
  cumulativeDistance: number,
  id?: string,
  isSingleSegment: boolean = false,
  referenceElevation: number = 0
): Entity => {
  const pointLabelText = createPointLabelText(
    positionGeographic,
    pointIndex,
    cumulativeDistance,
    isSingleSegment,
    referenceElevation
  );

  const measurementEntry = {
    id: id || `measurement-point-label-${Date.now()}`,
    name: `Point ${pointIndex + 1}`,
    geometryECEF: position,
  } as MeasurementEntry;

  const labelOptions: LabelOptions = {
    text: pointLabelText,
  };

  return createLabelEntity(measurementEntry, position, labelOptions);
};

export const createNodeNumberLabel = (
  position: Cartesian3,
  pointIndex: number,
  id?: string
): Entity => {
  const numberText = formatNumberToEnclosed(pointIndex + 1);

  const measurementEntry = {
    id: id || `measurement-point-number-${Date.now()}`,
    name: `Point Number ${pointIndex + 1}`,
    geometryECEF: position,
  } as MeasurementEntry;

  const labelOptions: LabelOptions = {
    text: numberText,
    font: LABEL_FONT_LARGER,
    pixelOffset: new Cartesian2(0, -1), // Centered on the point
    outlineWidth: 0,
    verticalOrigin: VerticalOrigin.CENTER,
    horizontalOrigin: HorizontalOrigin.CENTER,
    eyeOffset: new Cartesian3(0, 0, -0.5), // Closest to camera to ensure it renders above point markers and other labels
  };

  return createLabelEntity(measurementEntry, position, labelOptions);
};

/**
 * Calculates the screen-space distance between two world positions.
 * Returns null if either position is not visible or viewer is not available.
 */
const calculateScreenSpaceDistance = (
  viewer: Viewer | null,
  startPoint: Cartesian3,
  endPoint: Cartesian3
): number | null => {
  if (!viewer || viewer.isDestroyed()) return null;

  try {
    const startScreen = SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      startPoint
    );
    const endScreen = SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      endPoint
    );

    if (!startScreen || !endScreen) return null;

    return Cartesian2.distance(startScreen, endScreen);
  } catch {
    return null;
  }
};

/**
 * Estimates the pixel width of a text label based on character count.
 * This is a rough approximation based on typical font metrics.
 */
const estimateLabelWidth = (text: string): number => {
  // Average character width in pixels for our label font at 20px
  const avgCharWidth = 6;
  return text.length * avgCharWidth;
};

export const createPointLabelText = (
  pointGeographic: { height: number },
  pointIndex: number,
  cumulativeDistance: number,
  isSingleSegment: boolean,
  referenceElevation: number
): string => {
  const elevationDelta = pointGeographic.height - referenceElevation;
  const elevationFmt = `𝛥𝘩${formatDistance(elevationDelta)}`;

  return pointIndex === 0 || isSingleSegment
    ? elevationFmt
    : `${formatDistance(cumulativeDistance)} ${elevationFmt}`;
};

/**
 * Determines if a segment label should be shown based on visual length.
 * Returns true if the screen-space segment is long enough to accommodate the label.
 */
export const shouldShowSegmentLabel = (
  viewer: Viewer | null,
  startPoint: Cartesian3,
  endPoint: Cartesian3,
  labelText: string
): boolean => {
  const screenDistance = calculateScreenSpaceDistance(
    viewer,
    startPoint,
    endPoint
  );
  if (screenDistance === null) return false;

  const labelWidth = estimateLabelWidth(labelText);
  const minSegmentLength = labelWidth * 2.0; // Much more aggressive: 2x the label width

  return screenDistance >= minSegmentLength;
};

/**
 * Determines if a node label should be shown based on the segment length to the previous point.
 * Always shows labels for the first and last points.
 * Returns true if the segment from previous point is long enough to accommodate the label.
 */
export const shouldShowNodeLabel = (
  viewer: Viewer | null,
  currentPoint: Cartesian3,
  previousPoint: Cartesian3 | null,
  pointIndex: number,
  isLastPoint: boolean,
  labelText: string
): boolean => {
  // Always show first and last point labels
  if (pointIndex === 0 || isLastPoint) return true;

  // If no previous point, show the label
  if (!previousPoint) return true;

  const screenDistance = calculateScreenSpaceDistance(
    viewer,
    previousPoint,
    currentPoint
  );
  if (screenDistance === null) return true; // Show if we can't calculate

  const labelWidth = estimateLabelWidth(labelText);
  const minSegmentLength = labelWidth * 1.5; // 1.5x the label width for node labels

  return screenDistance >= minSegmentLength;
};

/**
 * Updates the visibility of traverse labels based on current camera position.
 * This should be called on camera move events to dynamically show/hide labels
 * based on the visual length of segments.
 * Only updates visibility when labels should be shown (respects showLabels prop).
 */
export const updateTraverseLabelVisibility = (
  viewer: Viewer | null,
  traverseEntities: Entity[],
  traverse: { geometryECEF: Cartesian3[]; heightOffset?: number }
): void => {
  if (!viewer || viewer.isDestroyed() || !traverse.geometryECEF) return;

  const heightOffset = traverse.heightOffset || 0;
  const elevatedPoints =
    heightOffset > 0
      ? traverse.geometryECEF.map((point) => {
          const localToFixedFrame = Transforms.eastNorthUpToFixedFrame(point);
          const localUp = Matrix4.getColumn(
            localToFixedFrame,
            2,
            new Cartesian4()
          );
          const upVector = new Cartesian3(localUp.x, localUp.y, localUp.z);
          const offsetVector = Cartesian3.multiplyByScalar(
            upVector,
            heightOffset,
            new Cartesian3()
          );
          return Cartesian3.add(point, offsetVector, new Cartesian3());
        })
      : traverse.geometryECEF;

  traverseEntities.forEach((entity) => {
    if (!entity.id || !entity.label) return;

    // Handle segment labels
    const segmentMatch = entity.id.match(/^segment-(.+)-(\d+)$/);
    if (segmentMatch) {
      const segmentIndex = parseInt(segmentMatch[2], 10);
      if (segmentIndex > 0 && segmentIndex < elevatedPoints.length) {
        const startPoint = elevatedPoints[segmentIndex - 1];
        const endPoint = elevatedPoints[segmentIndex];
        const labelText =
          entity.label.text?.getValue(viewer.clock.currentTime) || "";

        const shouldShow = shouldShowSegmentLabel(
          viewer,
          startPoint,
          endPoint,
          labelText
        );
        entity.show = shouldShow;
      }
    }

    // Handle point labels
    const pointMatch = entity.id.match(/^point-label-(.+)-(\d+)$/);
    if (pointMatch) {
      const pointIndex = parseInt(pointMatch[2], 10);
      const isLastPoint = pointIndex === elevatedPoints.length - 1;
      const previousPoint =
        pointIndex > 0 ? elevatedPoints[pointIndex - 1] : null;
      const currentPoint = elevatedPoints[pointIndex];
      const labelText =
        entity.label.text?.getValue(viewer.clock.currentTime) || "";

      const shouldShow = shouldShowNodeLabel(
        viewer,
        currentPoint,
        previousPoint,
        pointIndex,
        isLastPoint,
        labelText
      );
      entity.show = shouldShow;
    }

    // Handle point number labels - always show when labels are enabled
    const numberMatch = entity.id.match(/^point-number-(.+)-(\d+)$/);
    if (numberMatch) {
      entity.show = true; // Always show number labels when labels are enabled
    }
  });
};
