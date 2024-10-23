const x = [
  {
    index: 0,
    id: 42,
    text: "Shell Tankstelle",
    type: "Feature",
    selected: true,
    geometry: {
      type: "Point",
      coordinates: [378213.8326757813, 5685536.171230469],
    },
    properties: {
      hoverString: "Shell Tankstelle",
      color: "#247CE0",
      info: {
        title: "Shell Tankstelle",
        subtitle: "Autobahnanbindung A1 (Dreieck Wuppertal Nord) und A46 (Wuppertal Oberbarmen).",
        additionalInfo: "Schmiedestraße 91",
        actions: [
          {
            name: "zoomToFeature",
          },
          {},
        ],
      },
      tel: "+49-202-6294410",
      url: "https://www.think-ing.de/unternehmen/shell-deutsche-shell-holding-gmbh-hamburg",
      foto: "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_01.jpg",
      fotos: [
        "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_01.jpg",
        "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_02.jpg",
        "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_03.jpg",
        "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_04.jpg",
        "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_05.jpg",
        "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_06.jpg",
      ],
      secondaryInfos: {
        title: "Datenblatt: Wasserstofftankstelle Shell Tankstelle",
        iconName: "gas-pump",
        image: "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_01.jpg",
        md:
          '**Adresse**:\nSchmiedestraße 91\n\n<div style="padding-top:20px;"/>Autobahnanbindung A1 (Dreieck Wuppertal Nord) und A46 (Wuppertal Oberbarmen).\n\n<div style="padding-top:20px;"/>\n\n**Öffnungszeiten: **24 Stunden / 7 Tage',
        secondarySections: [
          {
            title: "Zapfmöglichkeit verfügbar (online)",
            type: "info",
            md: "**Zapfsäulen:** 2",
          },
          {
            title: "Bezahlen",
            type: "warning",
            md:
              "**Authentifizierung:** Offener Zugang während der Öffnungszeit.\n\n**Ladekosten:** Tagespreis für Wasserstoff.",
          },
          {
            title: "Betreiber",
            type: "success",
            md: "Deutsche Shell Holding GmbH\n\nSchmiedestraße 91\n\n42279 Wuppertal",
            links: true,
          },
        ],
      },
    },
  },
];
export default x;
