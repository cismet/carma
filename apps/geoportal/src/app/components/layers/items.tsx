import {
  faCircle,
  faGlobe,
  faMap,
  faSquare,
} from '@fortawesome/free-solid-svg-icons';

export const tabItems = (legend) => {
  return [
    {
      label: 'Legende',
      key: '1',
      children: (
        <div className="h-full overflow-auto">
          {legend?.map((legend, i) => (
            <img
              key={`legend_${i}`}
              src={legend.OnlineResource}
              alt="Legende"
              className="h-full"
            />
          ))}
        </div>
      ),
    },
    {
      label: 'Hintergrund',
      key: '2',
      children: (
        <p>
          Die Datenmodellierung lehnt sich an die ISO19112 an und beinhaltet u.
          a. die Mehrfachkategorisierung bei Auszeichnung einer Hauptkategorie,
          die optionale Zuordnung mehrerer alternativer Namen sowie die
          Zuordnung zu übergeordneten Themenfeldern (Lebenslagen). Die
          Koordinaten der POI bezogen sich ursprünglich auf die Amtliche
          Stadtkarte Wuppertal, eine leicht generalisierte Karte im Maßstab
          1:15.000. In 06/2018 wurden die POI-Koordinaten für die Nutzung der
          POI im Online-Stadtplan der Stadt Wuppertal, der mit dem Stadtplanwerk
          2.0 (SPW2.0) des Regionalverbandes Ruhr eine nicht generalisierte
          Kartengrundlage verwendet, überarbeitet. Dabei wurden vermittelnde
          Positionen bestimmt, die bei beiden Karten eine korrekte Lagezuordnung
          des POI zur Situationsdarstellung in der Hintergrundkarte ermöglichen.
          Die laufende Aktualisierung der Daten erfolgt im Zusammenhang mit den
          Kartenredaktionsarbeiten für die Fortführung des SPW2.0 im Bereich der
          Stadt Wuppertal. Der Datensatz ist unter einer Open-Data-Lizenz (CC BY
          4.0) verfügbar. Er umfasst jedoch Hyperlinks von Fotos, die u. U.
          nicht unter diese Lizenz fallen. Eine Weitergabe oder Veröffentlichung
          dieser Bilder ist mit dem jeweiligen Bildersteller zu vereinbaren.
        </p>
      ),
    },
    {
      label: 'Technische Informationen',
      key: '3',
      children: (
        <div className="flex flex-col gap-2">
          <a
            href="https://maps.wuppertal.de/karten?service=WMS&request=GetCapabilities&version=1.1.1"
            target="_blank"
          >
            GetCapabilities
          </a>
          <a
            href="https://offenedaten-wuppertal.de/dataset/interessante-orte-poi-wuppertal"
            target="_blank"
          >
            Open Data
          </a>
        </div>
      ),
    },
  ];
};

export const iconMap = {
  bäume: faCircle,
  gärten: faSquare,
  ortho: faGlobe,
  background: faMap,
};

export const iconColorMap = {
  bäume: 'green',
  gärten: 'purple',
  ortho: 'black',
};
