import type { FachzwillingRoute } from ".";

export const workflowsFachzwilling: FachzwillingRoute = {
  path: "workflows",
  hideFromCatalog: true,
  title: "Workflows",
  availability: {
    deployments: ["localDev", "dev", "pr"],
  },
  perspectives: [
    {
      id: "versorgung",
      title: "Gesundheitsversorgung",
      workflows: [
        {
          id: "einrichtungen",
          title: "Gesundheitseinrichtungen",
          description:
            "Inhalt: Krankenhäuser und Apotheken im Wuppertaler Stadtgebiet, " +
            "zusammengefasst als eine Layer-Gruppe. " +
            "Sichtbarkeit: öffentlich. " +
            "Nutzung: Zur Übersicht über die Gesundheitsversorgung im " +
            "Stadtgebiet.",
          thumbnail:
            "https://geo.wuppertal.de/geoportal/geoportal_vorschau/infra_apotheken.png",
          layers: ["wuppPOI:poi_krankenhaeuser", "wuppInfra:apotheken"],
          tools: ["layerVisibility", "zoomToExtent"],
          metaDataText:
            "Die Gruppe bündelt die Datensätze Krankenhäuser (wuppPOI) und " +
            "Apotheken (wuppInfra) aus dem Geoportal Wuppertal.",
          links: [
            {
              url: "https://www.wuppertal.de/vv/produkte/206/gesundheitsamt.php",
              text: "Gesundheitsamt Wuppertal",
            },
          ],
        },
      ],
    },
  ],
};
