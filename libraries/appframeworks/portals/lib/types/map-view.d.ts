/**
 * Hash values decoded from URL parameters
 * The hash provider decodes short URL keys to full property names
 * e.g., URL: #lat=51.27&lng=7.20 → { latitude: 51.27, longitude: 7.20 }
 */
export interface HashValues {
  latitude?: number;
  longitude?: number;
  zoom?: number;
  altitude?: number;
  heading?: number;
  bearing?: number;
  pitch?: number;
  fov?: number;
  engine?: "cesium3d" | "leaflet2d";
  mapStyle?: string;
}
