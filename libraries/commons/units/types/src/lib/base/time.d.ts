import { NumericUnit } from "../brands";

declare const millisecondsSymbol: unique symbol;
declare const secondsSymbol: unique symbol;

export type Milliseconds = NumericUnit<typeof millisecondsSymbol>;
export type Seconds = NumericUnit<typeof secondsSymbol>;
