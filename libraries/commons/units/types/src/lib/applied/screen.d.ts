import { NumericUnit } from "../brands";

// SCREEN UNITS

declare const cssPixelsSymbol: unique symbol;
declare const devicePixelsSymbol: unique symbol;

export type CssPixels = NumericUnit<typeof cssPixelsSymbol>;
export type DevicePixels = NumericUnit<typeof devicePixelsSymbol>;

// SCREEN UNIT QUALITIES

declare const widthSymbol: unique symbol;
declare const heightSymbol: unique symbol;

type CssPixelQuality<Q extends symbol> = CssPixels & {
  readonly [Quality in Q]: true;
};

export type CssPixelWidth = CssPixelQuality<typeof widthSymbol>;
export type CssPixelHeight = CssPixelQuality<typeof heightSymbol>;

export type CssPixelDimensions = {
  width: CssPixel;
  height: CssPixel;
};

export type CssPixelDimensionArgs = [
  width: CssPixelWidth,
  height: CssPixelHeight
];

export type CssPixelPosition = {
  x: CssPixels;
  y: CssPixels;
};
