export enum ENDPOINT {
    ADRESSEN = 'adressen',
    AENDERUNGSV = 'aenderungsv',
    BEZIRKE = 'bezirke',
    BPKLIMASTANDORTE = 'bpklimastandorte',
    BPLAENE = 'bplaene',
    EBIKES = 'ebikes',
    EMOB = 'emob',
    GEPS = 'geps',
    GEPS_REVERSE = 'geps_reverse',
    KITAS = 'kitas',
    PRBR = 'prbr',
    NO2 = 'no2',
    QUARTIERE = 'quartiere',
    POIS = 'pois'
  }

  export type LayerInfo = {
    title: string;
    layers: string;
    description: string;
    inhalt: string;
    eignung: string;
    url: string;
  };
  
  export type LayerMap = {
    [key: string]: LayerInfo;
  };