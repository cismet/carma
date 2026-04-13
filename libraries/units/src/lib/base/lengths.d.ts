import { NumericUnit } from "../brands";

declare const metersSymbol: unique symbol;

export type Meters = NumericUnit<typeof metersSymbol>;
