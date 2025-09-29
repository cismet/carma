// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type NumericUnit<S extends symbol> = number & { readonly [S]: true };

// SI and derived Units

declare const degreesSymbol: unique symbol;
declare const radiansSymbol: unique symbol;
declare const metersSymbol: unique symbol;
declare const ratioSymbol: unique symbol;
declare const percentSymbol: unique symbol;
declare const zoomSymbol: unique symbol;

// ratio, like Percent but normalized to unit range
// eg 0.05
export type Ratio = NumericUnit<typeof ratioSymbol>;
// eg 5%
export type Percent = NumericUnit<typeof percentSymbol>;

export type Degrees = NumericUnit<typeof degreesSymbol>;
export type Radians = NumericUnit<typeof radiansSymbol>;
export type Meters = NumericUnit<typeof metersSymbol>;

// XYZ SLIPPY MAP
export type Zoom = NumericUnit<typeof zoomSymbol>;

// SCREEN UNITS

declare const cssPixelsSymbol: unique symbol;
declare const devicePixelsSymbol: unique symbol;

export type CssPixels = NumericUnit<typeof cssPixelsSymbol>;
export type DevicePixels = NumericUnit<typeof devicePixelsSymbol>;

// SCREEN UNIT QUALITIES

declare const widthSymbol: unique symbol;
declare const heightSymbol: unique symbol;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type CssPixelQuality<S extends symbol> = CssPixels & {
  readonly [S]: true;
};

export type CssPixelWidth = CssPixelQuality<typeof widthSymbol>;
export type CssPixelHeight = CssPixelQuality<typeof heightSymbol>;
