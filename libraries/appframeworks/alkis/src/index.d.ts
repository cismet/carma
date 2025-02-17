interface TaskParams {
  ALKIS_CODE: string;
  PRODUKT?: string;
  STICHTAG?: string;
}

export interface TaskParameters {
  parameters: TaskParams;
}

export interface Name {
  uuid: string;
  namensnummernUUIds?: string[];
  eigentuemerUUId?: string;
}

export interface Owner {
  ownerId: string;
}

export interface AlkisRendererProps {
  landparcelId: string;
  jwt: string;
}
