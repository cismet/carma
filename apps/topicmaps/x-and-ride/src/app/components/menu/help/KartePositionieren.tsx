import Icon from 'react-cismap/commons/Icon';
import { Link } from 'react-scroll';
import { useContext } from 'react';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';

const KartePositionieren = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  return (
    <>
      <p>
        Um direkt zu einer P+R- oder B+R-Anlage zu gelangen, geben Sie den
        Anfang des Namens der Anlage im Eingabefeld links unten ein (mindestens
        2 Zeichen). In der inkrementellen Auswahlliste werden Ihnen passende
        Treffer angeboten. (Wenn Sie weitere Zeichen eingeben, wird der Inhalt
        der Auswahlliste angepasst.) Sie können auch andere Suchbegriffe
        eingeben, nämlich Stadtteil (Stadtbezirk oder Quartier), Adresse,
        Straßenname oder POI. Durch das in der Auswahlliste vorangestellte
        Symbol erkennen Sie, ob es sich bei einem Treffer um eine{' '}
        <Icon name="car" /> P+R-Anlage, eine <Icon name="bicycle" /> B+R-Anlage,
        einen <Icon name="circle" /> Stadtbezirk, ein <Icon name="pie-chart" />{' '}
        Quartier, eine <Icon name="home" /> Adresse, eine <Icon name="road" />{' '}
        Straße ohne zugeordnete Hausnummern, einen <Icon name="tag" /> POI, die{' '}
        <Icon name="tags" /> alternative Bezeichnung eines POI, eine{' '}
        <Icon name="child" /> Kindertageseinrichtung oder eine{' '}
        <Icon name="graduation-cap" /> Schule handelt. Tipp: Durch Eingabe von
        "P+" oder "B+" erzeugen Sie eine vollständige Auswahlliste aller P+R-
        bzw. B+R-Anlagen.
      </p>
      <p>
        Nach der Auswahl eines Treffers aus der Liste wird die Karte auf die
        zugehörige Position zentriert. Bei Suchbegriffen mit Punktgeometrie
        (P+R- oder B+R-Anlage, Adresse, Straße, POI) wird außerdem ein großer
        Maßstab (Zoomstufe 14) eingestellt und ein Marker{' '}
        <Icon name="map-marker" /> auf der Zielposition platziert. Bei
        Suchbegriffen mit Flächengeometrie (Stadtbezirk, Quartier) wird der
        Maßstab so eingestellt, dass die Fläche vollständig dargestellt werden
        kann. Zusätzlich wird der Bereich außerhalb dieser Fläche abgedunkelt
        (Spotlight-Effekt).
      </p>
      <p>
        Durch Anklicken des Werkzeugs <Icon name="times" /> links neben dem
        Eingabefeld können Sie die Suche zurücksetzen (Entfernung von Marker
        bzw. Abdunklung, Löschen des Textes im Eingabefeld).
      </p>
      <p>
        Wenn Sie die Karte wie oben beschrieben auf eine P+R- bzw. B+R-Anlage
        positionieren, erhält diese sofort den Fokus, sodass die zugehörigen
        Informationen direkt in der Info-Box angezeigt werden. Voraussetzung
        dafür ist, dass die aktuellen{' '}
        <Link
          to="MeinThemenstadtplan"
          containerId="myMenu"
          onClick={() => setAppMenuActiveMenuSection('filter')}
          className="renderAsLink"
        >
          Filtereinstellungen
        </Link>{' '}
        die Darstellung der Anlage in der Karte erlauben.
      </p>
    </>
  );
};

export default KartePositionieren;
