export interface FilterItem {
  title: string;
  enabled: boolean;
}

export type FilterState = Record<string, FilterItem>;
