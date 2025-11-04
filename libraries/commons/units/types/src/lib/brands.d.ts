export type NumericUnit<S extends symbol> = number & {
  readonly [Brand in S]: true;
};
