export type StopWords = string[];

export type Option = {
  key: string;
  value: string;
  label: JSX.Element;
  sData: any; // Replace 'any' with the actual type if known
};

export type OptionItem = {
  label: JSX.Element;
  options: Option[];
};

export type ENDPOINT =
  | 'adressen'
  | 'bezirke'
  | 'bpklimastandorte'
  | 'kitas'
  | 'quartiere'
  | 'pois';

export type SourcesConfig = {
  [key in ENDPOINT]: string;
};
