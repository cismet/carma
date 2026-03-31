import { NumericUnit } from "../brands";

declare const millisecondsSymbol: unique symbol;

export type Milliseconds = NumericUnit<typeof millisecondsSymbol>;
