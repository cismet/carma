# Catalog Filter Playground

Baukasten für Fachzwilling-Configs des Geoportals (thematische Routen mit
immer aktiven Katalog-Filtern, siehe
`libraries/mapping/layers/FILTERING.MD` und
`apps/geoportal/src/app/constants/fachzwillinge.ts`).

```sh
npx nx serve catalog-filter-playground
```

Links werden Route-Metadaten (path, title, description) und
`CatalogFilter`-Zeilen bearbeitet, gruppiert in ODER-Gruppen (innerhalb einer
Gruppe UND, zwischen Gruppen ODER); rechts zeigt das echte
Karteninhalte-Modal (`LayerCatalog`) live das gefilterte Ergebnis. Die
Wertevorschläge (Item-Ids, Schlüsselwörter, Kategorien) kommen aus den
geladenen Service-Capabilities plus den statischen Teilzwilling-Kategorien;
Discover-Items lassen sich als Freitext eintragen.

Der Export-Bereich erzeugt daraus wahlweise ein fertiges TypeScript-Modul im
Stil von `gesundheit.ts` (inklusive Registrierungs-Hinweis für
`fachzwillingRoutes`) oder die Config als JSON.
