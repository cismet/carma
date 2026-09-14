import type { LayerMap, NamedLayers } from "@carma-appframeworks/portals";
import type { SceneStyleId } from "@carma-mapping/engines/cesium/react/runtime";

import { MapStyleKeys } from "../constants/MapStyleKeys";

/**
 * One background category, i.e. one button of the map switch. Its `id` is at
 * the same time the map style key (the `mapStyle` hash param) and the `id` of
 * the store's `backgroundLayer`, so switching the category is switching the
 * style.
 */
export type BackgroundCategory = {
  /** category id; doubles as the map style key and as backgroundLayer.id */
  id: string;
  /** navbar / selection button label in 2D */
  title: string;
  /** label in 3D */
  title3d?: string;
  /** info panel texts in 3D */
  description3d?: { inhalt: string; eignung: string };
  /** which Cesium scene setup this category shows; several may share one */
  cesiumSceneStyle?: SceneStyleId;
  /** ids into layerMap, in display order */
  entries: string[];
  /** defaults to entries[0] */
  defaultEntry?: string;
};

export type BackgroundConfig = {
  categories: BackgroundCategory[];
  defaultCategory: string;
  /** base map definitions; a route may add to or override the app-wide ones */
  layerMap?: LayerMap;
  /** service definitions the entries reference */
  namedLayers?: NamedLayers;
};

export const geoportalBackgroundConfig: BackgroundConfig = {
  defaultCategory: MapStyleKeys.TOPO,
  categories: [
    {
      id: MapStyleKeys.TOPO,
      title: "Karte",
      title3d: "LoD2-Gebäude (NRW)",
      description3d: {
        inhalt: `Ausschnitt des für ganz Nordrhein-Westfalen vorliegenden 3D-Gebäudemodells der Landesvermessung NRW (Geobasis NRW) in der inhaltlichen Ausbaustufe "Level of Detail 2 (LoD2)".`,
        eignung: `Ein 3D-Gebäudemodell in der Ausbaustufe "Level of Detail 2 (LoD2)" umfasst einfache Gebäudeformen mit standardisierten Dachformen. Ein solches Modell strebt eine abstrahierte, also nicht realistisch wirkende Darstellung der Gebäudesituation an. Es eignet sich dann als Grundlage, wenn die Gebäude aufgrund ihrer Eigenschaften thematisch dargestellt werden sollen (z. B. unterschiedliche Einfärbung von öffentlichen und privaten Gebäuden). Als Datenquelle für die die Gebäudehöhen dienen die Ergebnisdaten von Laserscanner-Befliegungen, die das Land NRW regelmäßig für Teilbereiche der Landesfläche durchführt, für Wuppertal zuletzt im Jahr 2020.`,
      },
      cesiumSceneStyle: MapStyleKeys.TOPO,
      entries: ["stadtplan", "gelaende", "amtlich"],
    },
    {
      id: MapStyleKeys.AERIAL,
      title: "Luftbild",
      title3d: "3D-Mesh 03/2024",
      description3d: {
        inhalt: `3D-Mesh, berechnet auf der Grundlage von Senkrecht- und Schrägluftbildern aus Bildflügen der Firma Aerowest GmbH/Dortmund vom 14.03. und 17.03.2024, hergestellt durch Aerowest GmbH/Dortmund, Bodenauflösung des Ausgangsbildmaterials 3 cm.`,
        eignung: `Ein 3D-Mesh wird automatisiert aus Senkrecht- und Schrägluftbildern erzeugt, die bei derselben Befliegung erstellt wurden. Dabei wird aus den Bilddaten ein digitales Oberflächenmodell in Form eines Dreiecksnetzes berechnet, auf das die Bilder projiziert werden. Solche Modelle können Fehler und Lücken enthalten, vor allem dort, wo verschiedene Ebenen übereinander liegen, wie zum Beispiel bei den Schwebebahnhöfen. Ein 3D-Mesh strebt eine fotorealistische Darstellung der Situation an. Es eignet sich daher immer dann, wenn Anschaulichkeit, einfache Orientierung und schnelles Wiedererkennen der Örtlichkeit benötigt werden. Das 3D-Mesh 03/2024 basiert auf einer von der Stadt Wuppertal beauftragten Befliegung vor dem Einsetzen der Belaubung (Winterbefliegung). Die Straßenbereiche sind daher vollständig sichtbar, während die Grünbereiche nicht gut zu interpretieren sind. Aktualität: Wuppertal lässt in einem Turnus von 2 Jahren Bildflüge durchführen. Die dargestellte Situation, z. B. bezüglich des Gebäudebestandes, kann daher bis zu 2,5 Jahre alt sein.`,
      },
      cesiumSceneStyle: MapStyleKeys.AERIAL,
      entries: ["luftbild", "luftbild21"],
    },
  ],
};
