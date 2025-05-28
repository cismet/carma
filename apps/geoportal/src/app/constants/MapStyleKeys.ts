export enum MapStyleKeys {
  TOPO = "karte",
  AERIAL = "luftbild",
}

export type MapStyle = keyof typeof MapStyleKeys;
