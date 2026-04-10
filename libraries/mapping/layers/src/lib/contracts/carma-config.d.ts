export type CarmaConfig = Record<
  string,
  string | string[] | boolean | Record<string, { layers: string[] }>
>;
