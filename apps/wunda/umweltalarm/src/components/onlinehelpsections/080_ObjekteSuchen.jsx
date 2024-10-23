import { Link } from "react-scroll";
import slugify from "slugify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faSquare, faMap } from "@fortawesome/free-solid-svg-icons";

const ObjekteSuchen = () => {
  return (
    <div>
      <p>
        Mit der Funktion{" "}
        <span style={{ color: "#444" }} className='fa-layers fa-fw '>
          <FontAwesomeIcon transform='grow-9' icon={faSearch} size='sm' />
          <FontAwesomeIcon transform='shrink-8 up-2 left-2.3' icon={faSquare} size='sm' />
        </span>{" "}
        &quot;Objekte im Kartenfenster suchen&quot; am unteren Ende des Werkzeugblocks links oben
        wird einmalig eine Suche von Objekten aller Kategorien im aktuellen Kartenausschnitt
        durchgeführt. Die Gesamtanzahl der hierbei gefundenen Objekte einschließlich der Kategorien
        Wasserverband, Straßenmeisterei und Autobahnmeisterei wird in der Titelzeile der Info-Box
        als &quot;Analyseergebnis (Kartenfenster)&quot; angezeigt. Die Darstellung der gefundenen
        Objekte in der Info-Box und in der Datenblattansicht entspricht ansonsten weitgehend dem
        Verhalten beim{" "}
        <Link
          class='renderAsLink'
          to={slugify("Karteninhalt verschieben und thematischer Durchstich")}
          containerId={"myMenu"}
          activeClass='active'
        >
          thematischen Durchstich
        </Link>
        . (Abweichungen: In der Datenblattansicht werden wegen der potenziell hohen Trefferanzahl
        nicht alle städtischen Flurstücke aufgelistet, sondern nur das Flurstück mit dem geringsten
        Abstand zum Fadenkreuz. Außerdem wird in der Info-Box bei <strong>allen</strong> Kategorien
        ggf. die Anzahl der zusätzlich im Kartenausschnitt gefundenen Objekte ausgeprägt, z. B.
        &quot;(+20)&quot; bei insgesamt 21 Treffern). Mit der Schaltfläche{" "}
        <FontAwesomeIcon icon={faMap} /> &quot;in Karte anzeigen&quot; können die gefundenen Objekte
        (bis auf die Treffer in den Kategorien Wasserverband, Straßenmeisterei und
        Autobahnmeisterei) in der Karte als flächenhafte, leicht transparente Überlagerungen
        ausgeprägt werden. Wenn der Modus &quot;in Karte anzeigen&quot; bereits aktiviert ist
        (Schaltfläche dann mit grünem Hintergrund), erfolgt die Anzeige in der Karte sofort.{" "}
      </p>
      <p>
        Die Funktion ist als Einmal-Aktion implementiert, mit der Sie sich schnell einen Überblick
        über die relevanten Objekte in der näheren Umgebung Ihres Einsatzortes verschaffen können.
        Mit der nächsten Aktion zur Veränderung des Kartenausschnittes (Positionierung, Verschiebung
        oder Zoom-in / Zoom-out) wird wieder ein thematischer Durchstich an der Position des
        Fadenkreuzes ausgelöst. Um die Anzahl der gefundenen und darzustellenden Objekte auf ein
        praktikables Maß zu beschränken, ist diese Funktion nur in den großen
        Kartendarstellungsmaßstäben (ab Zoomstufe 16) ausführbar.{" "}
      </p>
    </div>
  );
};
export default ObjekteSuchen;
