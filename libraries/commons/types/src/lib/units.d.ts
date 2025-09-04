
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type NumericUnit<S extends symbol> = number & { readonly [S]: true };

declare const degreesSymbol: unique symbol;
declare const radiansSymbol: unique symbol;
declare const metersSymbol: unique symbol;

export type Degrees = NumericUnit<typeof degreesSymbol>;
export type Radians = NumericUnit<typeof radiansSymbol>;
export type Meters  = NumericUnit<typeof metersSymbol>;