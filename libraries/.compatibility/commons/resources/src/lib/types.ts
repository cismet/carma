/**
 * Legacy types from dev branch
 * These types are defined locally to support compatibility layer
 */

/* eslint-disable @carma/no-direct-cesium-import */
import type {
  CustomShaderMode,
  CustomShaderTranslucencyMode,
  LightingModel,
  UniformSpecifier,
  VaryingType,
} from "cesium";
/* eslint-enable @carma/no-direct-cesium-import */

// Numeric unit system
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type NumericUnit<S extends symbol> = number & { readonly __brand: S };

declare const degreesSymbol: unique symbol;
declare const radiansSymbol: unique symbol;
declare const metersSymbol: unique symbol;

export type Degrees = NumericUnit<typeof degreesSymbol>;
export type Radians = NumericUnit<typeof radiansSymbol>;
export type Meters = NumericUnit<typeof metersSymbol>;

// Altitude types
declare const EllipsoidalWGS84MetersSymbol: unique symbol;
declare const DHHN2016MetersSymbol: unique symbol;

export namespace Altitude {
  export type EllipsoidalWGS84Meters = Meters &
    NumericUnit<typeof EllipsoidalWGS84MetersSymbol>;
  export type DHHN2016Meters = Meters &
    NumericUnit<typeof DHHN2016MetersSymbol>;
}

export type AltitudeEllipsoidalWGS84Meters = Altitude.EllipsoidalWGS84Meters;

// Geographic coordinates
interface LatLngDegrees {
  latitude: Degrees;
  longitude: Degrees;
  altitude?: Altitude.EllipsoidalWGS84Meters;
}

interface LatLngRadians {
  latitude: Radians;
  longitude: Radians;
  altitude?: Altitude.EllipsoidalWGS84Meters;
}

export namespace LatLng {
  export type deg = LatLngDegrees;
  export type rad = LatLngRadians;
}

export namespace Extent {
  export type deg = {
    east: Degrees;
    north: Degrees;
    south: Degrees;
    west: Degrees;
  };
  export type rad = {
    east: Radians;
    north: Radians;
    south: Radians;
    west: Radians;
  };
}

// Heading/Pitch/Roll angles
interface HeadingPitchRollDegrees {
  heading?: Degrees;
  pitch?: Degrees;
  roll?: Degrees;
}

interface HeadingPitchRollRadians {
  heading?: Radians;
  pitch?: Radians;
  roll?: Radians;
}

export namespace HeadingPitchRoll {
  export type deg = HeadingPitchRollDegrees;
  export type rad = HeadingPitchRollRadians;
}

// Cartesian coordinates
export interface Cartesian3Meters {
  x: Meters;
  y: Meters;
  z: Meters;
}

export interface PlainCartesian3 {
  x: number;
  y: number;
  z: number;
}

// Cesium custom shader options
export interface CesiumCustomChaderOptions {
  mode?: CustomShaderMode;
  lightingModel?: LightingModel;
  translucencyMode?: CustomShaderTranslucencyMode;
  uniforms?: {
    [key: string]: UniformSpecifier;
  };
  varyings?: {
    [key: string]: VaryingType;
  };
  vertexShaderText?: string;
  fragmentShaderText?: string;
}

/**
 * Position preset for map initialization
 */
export type PositionPreset = {
  name: string;
  position: LatLng.deg;
  zoom?: number;
  altitude?: Altitude.EllipsoidalWGS84Meters;
};
