import proj4 from "proj4";
import {
  ManagedProjection,
  ManagedProjections,
  ManagedDefs,
} from "./managed-projections";
import { registerManagedProjections } from "./utils";
import type {
  Longitude,
  Latitude,
  LngLatArrayTyped,
  Altitude,
} from "@carma/geo/types";

export type CoordinateFor<P extends ManagedProjection> = P extends "EPSG:4326"
  ?
      | LngLatArrayTyped<Longitude.deg, Latitude.deg>
      | LngLatArrayTyped<Longitude.deg, Latitude.deg, [Altitude.GenericMeters]>
  : P extends "EPSG:3857"
  ? number[]
  : P extends "EPSG:25832"
  ? number[]
  : number[];

export type TypedConverter<
  TSource extends ManagedProjection = ManagedProjection,
  TTarget extends ManagedProjection = ManagedProjection
> = {
  forward<T extends CoordinateFor<TSource>>(
    coordinates: T,
    enforceAxis?: boolean
  ): CoordinateFor<TTarget>;
  inverse<T extends CoordinateFor<TTarget>>(
    coordinates: T,
    enforceAxis?: boolean
  ): CoordinateFor<TSource>;
  sourceCrs: TSource;
  targetCrs: TTarget;
};

// Direct mapping from string keys to converters
export type Proj4Converters = Record<
  ManagedProjection,
  Record<ManagedProjection, TypedConverter>
>;

registerManagedProjections(ManagedProjections, ManagedDefs);

// Nested Map for maximum performance (benchmarked 74% faster than string keys)
const proj4ConverterCache = new Map<
  ManagedProjection,
  Map<ManagedProjection, TypedConverter<any, any>>
>();

export function getProj4Converter<
  TSource extends ManagedProjection,
  TTarget extends ManagedProjection
>(sourceCrs: TSource, targetCrs: TTarget): TypedConverter<TSource, TTarget> {
  // Initialize source CRS map if it doesn't exist
  if (!proj4ConverterCache.has(sourceCrs)) {
    proj4ConverterCache.set(sourceCrs, new Map());
  }

  const sourceMap = proj4ConverterCache.get(sourceCrs)!;

  // Get or create converter for this source->target pair
  if (!sourceMap.has(targetCrs)) {
    const rawConverter = proj4(sourceCrs, targetCrs);

    // Defensive check: ensure we're not overwriting proj4 properties
    if ("sourceCrs" in rawConverter || "targetCrs" in rawConverter) {
      throw new Error(
        `proj4 converter already has 'sourceCrs' or 'targetCrs' property. ` +
          `This may indicate a breaking change in the proj4 library.`
      );
    }

    sourceMap.set(targetCrs, {
      ...rawConverter,
      sourceCrs,
      targetCrs,
    } as TypedConverter<TSource, TTarget>);
  }

  return sourceMap.get(targetCrs)! as TypedConverter<TSource, TTarget>;
}

// shorthands, implicit preference for source CRS as WGS84

// to
export const getToWebMercatorConverter = <TSource extends ManagedProjection>(
  sourceCrs: TSource
): TypedConverter<TSource, typeof ManagedProjections.EPSG3857> =>
  getProj4Converter(sourceCrs, ManagedProjections.EPSG3857);

export const getToUTM32Converter = <TSource extends ManagedProjection>(
  sourceCrs: TSource
): TypedConverter<TSource, typeof ManagedProjections.EPSG25832> =>
  getProj4Converter(sourceCrs, ManagedProjections.EPSG25832);

// from
export const getFromWGS84Converter = <TTarget extends ManagedProjection>(
  targetCrs: TTarget
): TypedConverter<typeof ManagedProjections.EPSG4326, TTarget> =>
  getProj4Converter(ManagedProjections.EPSG4326, targetCrs);

// Convenience methods for common conversions
// inverse methods involving EPSG are preferred for performance of equivalent forward methods
export const getFromWGS84ToWebMercator = (
  coords: LngLatArrayTyped<Longitude.deg, Latitude.deg>
): CoordinateFor<typeof ManagedProjections.EPSG3857> =>
  getProj4Converter(
    ManagedProjections.EPSG4326,
    ManagedProjections.EPSG3857
  ).forward(coords);

export const getFromWebMercatorToWGS84 = (
  coords: number[]
): CoordinateFor<typeof ManagedProjections.EPSG4326> =>
  getProj4Converter(
    ManagedProjections.EPSG4326,
    ManagedProjections.EPSG3857
  ).inverse(coords);

export const getFromUTM32ToWGS84 = (
  coords: number[]
): CoordinateFor<typeof ManagedProjections.EPSG4326> =>
  getProj4Converter(
    ManagedProjections.EPSG4326,
    ManagedProjections.EPSG25832
  ).inverse(coords);

export const getFromWGS84ToUTM32 = (
  coords: LngLatArrayTyped<Longitude.deg, Latitude.deg>
): CoordinateFor<typeof ManagedProjections.EPSG25832> =>
  getProj4Converter(
    ManagedProjections.EPSG25832,
    ManagedProjections.EPSG4326
  ).inverse(coords);
