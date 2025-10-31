# Single Icon Legende

## Implementierung
Die Legende kann über eine Config oder über die Vektorstyles mit `icon` definiert werden.

1. Konkreter Link
```json
"icon": "https://tiles.cismet.de/vorhabenkarte/assets/vorhaben.icon.png"
```

2. Pfad + Name
```json
"icon": "poi/alle_interessanten_Orte"
```

Der Pfad und Name werden dann in Kombination mit der Basisurl "https://www.wuppertal.de/geoportal/geoportal_icon_legends/" verwendet.

## Verwendungszweck
Die Single Icon Legende wird in den Layerbuttons, sowie in der Layer Info View des Basislayers angezeigt. Dafür wird LayerIcon.tsx aus der mapping Library verwendet.

# Infobox

```json5
{
    "header": "string | html",
    "headerColor": "string",
    "title": "string",
    "subtitle": "string",
    "modal": "string",
    "email": "string",
    "tel": "string",
    "url": "string",
    "foto": "string",
    "fotos": "string[]", // funktionieren nur wenn "foto" auch angegeben wurde
    "genericLinks": [
        {
            "tooltip": "string",
            "icon": "string",
            "url": "string",
            "target": "string"
        }
    ]
}
```

# Additional Configs

```json5
{
    "Title": "string", // Titel der Kategorie im Modal
    "serviceName": "string", // Wird intern genutzt um unique ids zu generieren falls es mehrere Layer mit der gleichen id aber in unterschiedlichen Kategorien gibt.
    "layers": "siehe Layer Informationen[]"
}
```

# Layer Informationen
```json5
{
    "replaceId": "wuppKarten:expsw",
    "title": "string",
    "description": "string", // String der nach "Inhalt:" und "Nutzung:" schaut und den Text danach formatiert. Wenn die Begriffe nicht genutzt werden, wird der gesamte Text unter Inhalt angezeigt.
    "tags": "string[]", // Werden unter der Beschreibung angezeigt, können für die Suche genutzt werden 
    "keywords": [
        "carmaconf://infoBoxMapping:",
        "carmaconf://blockLegacyGetFeatureInfo", // Wird genutzt um die Verlinkung auf die die Wuppertaler Feature Info nicht anzuzeigen
        "carmaconf://opendata:https://www.offenedaten-wuppertal.de/dataset/interessante-orte-poi-wuppertal" // Wird unter den Links als "Datenquelle im Open-Data-Portal Wuppertal" angezeigt
    ],
    "id": "string",
    "vectorStyle": "string",
    "type": "layer",
    "queryable": "boolean",
    "path": "Basis", // Wird für die Suche im Modal genutzt.
    "icon": "url || path", // Wie oben beschrieben
    "thumbnail": "https://tiles.cismet.de//hoehenlinien/assets/hoehenlinien.png",
    "ff": "string", // Feature Flag die genutzt werden kann damit der Layer nicht immer angezeigt wird
    "vectorLegend": "string", // Für Vector Legenden
    "props": {
          "Style": [
            {
              "Name": "default",
              "Title": "default",
              "LegendURL": [
                {
                  "Format": "image/png",
                  "OnlineResource": "https://www.wuppertal.de/geoportal/legenden/default_R102_ALKIS_Vektor_FlstGeb_gelb.png", // Struktur kommt noch von den wms Legenden. Für Vector Styles kann einfach vectorLegend verwendet werden
                  "size": [231, 358]
                }
              ]
            }
          ],
          "MetadataURL": [
            {
                "Format": "application/xml",
                "OnlineResource": "https://apps.geoportal.nrw.de/soapServices/CSWStartup?Service=CSW&Request=GetRecordById&Version=2.0.2&outputSchema=https://www.isotc211.org/2005/gmd&elementSetName=full&id=2d02ff73-d2ca-4c8a-9f4c-176b2e2b97bc", // Wird für die Secondary Info View der hinzugefügten Layer genutzt. Text davon wird unter "Datenquelle" angezeigt und kann als pdf runtergeladen werden
                "type": "TC211"
            }
        ]
        }
}
```

Falls irgendwelche Links oder spezielle Metadatan gefordert sind die hier nicht aufgelistet sind, dann nach einem Layer im Modal suchen wo dies bereits vorhanden ist und einmal darauf klicken. Danach werden die ganzen Informationen in der Console ausgegeben und man kann schauen was genau angegeben werden muss.