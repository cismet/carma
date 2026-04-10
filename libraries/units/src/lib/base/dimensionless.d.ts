import { NumericUnit } from "../brands";

declare const ratioSymbol: unique symbol;
declare const percentSymbol: unique symbol;

// ratio, like Percent but normalized to unit range
// eg 0.05
export type Ratio = NumericUnit<typeof ratioSymbol>;
// eg 5%
export type Percent = NumericUnit<typeof percentSymbol>;
