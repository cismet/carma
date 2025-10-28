/**
 * Hash values decoded from URL parameters
 * The hash provider decodes short URL keys to full property names
 * e.g., URL: #lat=51.27&lng=7.20 → { latitude: 51.27, longitude: 7.20 }
 */
export interface HashValues {
  latitude?: number;
  longitude?: number;
  zoom?: number;
  altitude?: number; // Height/altitude for 3D camera
  heading?: number;
  bearing?: number; // Used by maplibre
  pitch?: number;
  fov?: number; // Field of view in degrees
  engine?: "cesium3d" | "leaflet2d";
  mapStyle?: string;
  // ... other hash values
}
