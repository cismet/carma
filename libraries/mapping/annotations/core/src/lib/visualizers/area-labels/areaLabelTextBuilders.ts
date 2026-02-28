import { Cartesian3 } from "@carma/cesium";

import { type PlanarPolygonGroup } from "../../types/measurementTypes";
import { type AreaLabelText } from "./areaLabelVisualizer.types";

const AREA_DISPLAY_HECTARE_THRESHOLD_SQM = 4999;
const DEFAULT_SIGNIFICANT_DIGITS = 3;

const formatSignificant = (
  value: number,
  significantDigits = DEFAULT_SIGNIFICANT_DIGITS
) => {
  if (!Number.isFinite(value)) return "0";
  const absolute = Math.abs(value);
  if (absolute === 0) return "0";
  const digitsBeforeDecimal = Math.floor(Math.log10(absolute)) + 1;
  const fractionDigits = Math.max(0, significantDigits - digitsBeforeDecimal);
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
};

const formatAreaAdaptive = (areaSquareMeters: number) => {
  if (!Number.isFinite(areaSquareMeters) || areaSquareMeters <= 0) {
    return "0 m²";
  }
  if (areaSquareMeters > AREA_DISPLAY_HECTARE_THRESHOLD_SQM) {
    return `${formatSignificant(areaSquareMeters / 10000)} ha`;
  }
  return `${formatSignificant(areaSquareMeters)} m²`;
};

const getProjectedHorizontalAreaSquareMeters = (vertices: Cartesian3[]) => {
  if (vertices.length < 3) return 0;
  const basePoint = vertices[0];
  if (!basePoint) return 0;

  let area = 0;
  for (let index = 1; index < vertices.length - 1; index += 1) {
    const p1 = Cartesian3.subtract(
      vertices[index],
      basePoint,
      new Cartesian3()
    );
    const p2 = Cartesian3.subtract(
      vertices[index + 1],
      basePoint,
      new Cartesian3()
    );
    const cross = Cartesian3.cross(p1, p2, new Cartesian3());
    area += Cartesian3.magnitude(cross) * 0.5;
  }

  return Math.max(0, area);
};

const buildAreaLabelTextWithProjectedHorizontal = (
  group: PlanarPolygonGroup,
  vertices: Cartesian3[]
): AreaLabelText => {
  const planarArea = Math.max(0, group.areaSquareMeters ?? 0);
  const isFacadeSurface = (group.surfaceType ?? "roof") === "facade";
  const projectedHorizontalArea =
    getProjectedHorizontalAreaSquareMeters(vertices);
  const showProjectedHorizontalArea =
    !isFacadeSurface &&
    planarArea > 0 &&
    projectedHorizontalArea < planarArea * 0.99;

  return {
    primaryText: formatAreaAdaptive(planarArea),
    secondaryText: showProjectedHorizontalArea
      ? `(${formatAreaAdaptive(projectedHorizontalArea)})`
      : null,
  };
};

export const buildGroundAreaLabelText = (
  group: PlanarPolygonGroup,
  vertices: Cartesian3[]
): AreaLabelText => buildAreaLabelTextWithProjectedHorizontal(group, vertices);

export const buildPlanarAreaLabelText = (
  group: PlanarPolygonGroup,
  vertices: Cartesian3[]
): AreaLabelText => buildAreaLabelTextWithProjectedHorizontal(group, vertices);

export const buildVerticalAreaLabelText = (
  group: PlanarPolygonGroup
): AreaLabelText => ({
  primaryText: formatAreaAdaptive(Math.max(0, group.areaSquareMeters ?? 0)),
  secondaryText: null,
});
