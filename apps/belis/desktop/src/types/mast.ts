export type Root = Root2[];

export interface Root2 {
  bezeichnung?: string;
  wandstaerke?: number;
  masttyp: string;
  lph?: number;
  id: number;
  hersteller?: string;
  foto: any;
  dokumenteArray: DokumenteArray[];
}

export interface DokumenteArray {
  dms_url: DmsUrl;
}

export interface DmsUrl {
  description: string;
  id: number;
  name: any;
  typ: any;
  url: Url;
}

export interface Url {
  id: number;
  object_name: string;
  url_base: UrlBase;
}

export interface UrlBase {
  id: number;
  path: string;
  prot_prefix: string;
  server: string;
}
