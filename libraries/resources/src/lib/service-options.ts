export type ServiceOption = {
  value: string;
  label: string;
};

export const serviceOptions: ServiceOption[] = [
  { value: "discoverPoi", label: "POI" },
  { value: "discoverPlanung", label: "Planung" },
  { value: "discoverVerkehr", label: "Verkehr" },
  { value: "discoverUmwelt", label: "Umwelt" },
  { value: "discoverInfra", label: "Infrastruktur" },
  { value: "discoverImmo", label: "Immobilien" },
  { value: "discoverGebiet", label: "Gebiete" },
  { value: "discoverBasis", label: "Basis" },
];
