import { NumericUnit } from "../brands";

declare const degreesSymbol: unique symbol;
declare const radiansSymbol: unique symbol;

export type Degrees = NumericUnit<typeof degreesSymbol>;
export type Radians = NumericUnit<typeof radiansSymbol>;
