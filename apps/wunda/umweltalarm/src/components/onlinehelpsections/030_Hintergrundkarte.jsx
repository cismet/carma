import { Link } from "react-scroll";
import slugify from "slugify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
const Hintergrundkarten = () => {
  return (
    <div>
      <p>
        Im Anwendungsmenü <FontAwesomeIcon icon='bars' /> können Sie im Abschnitt{" "}
        <strong>Einstellungen</strong> unter <strong>Hintergrundkarte</strong> festlegen, welche
        Basiskarte und welche optionalen fachlichen Überlagerungen angezeigt werden sollen. Die
        folgenden Basiskarten stehen zur Verfügung:
      </p>
      <ul>
        <li>
          <p>
            <strong>Stadtplan</strong>: Kartendienst (WMS) des Regionalverbandes Ruhr (RVR).
            Datengrundlage: Stadtkarte 2.0. Wöchentlich in einem automatischen Prozess aktualisierte
            Zusammenführung des Straßennetzes der OpenStreetMap mit Amtlichen Geobasisdaten des
            Landes NRW aus den Fachverfahren ALKIS (Gebäude, Flächennutzungen) und ATKIS (Gewässer).
            © RVR und Kooperationspartner (
            <a target='_more' href='https://www.govdata.de/dl-de/by-2-0'>
              Datenlizenz Deutschland - Namensnennung - Version 2.0
            </a>
            ). Lizenzen der Ausgangsprodukte:{" "}
            <a target='_more' href='https://www.govdata.de/dl-de/zero-2-0'>
              Datenlizenz Deutschland - Zero - Version 2.0
            </a>{" "}
            (Amtliche Geobasisdaten) und{" "}
            <a target='_more' href='https://www.opendatacommons.org/licenses/odbl/1.0/'>
              ODbL
            </a>{" "}
            (OpenStreetMap contributors).
          </p>
        </li>
        <li>
          <p>
            <strong>Stadtplan (grau) / Stadtplan (bunt)</strong>: Vektorkacheldienst (Vector tile
            service gemäß{" "}
            <a target='_more' href='https://github.com/mapbox/vector-tile-spec'>
              Mapbox Vector Tile Specification
            </a>
            ) auf der Basis eines von der Firma cismet GmbH gehosteten Sekundärdatenbestandes der
            OpenStreetMap Deutschland mit wöchentlicher Aktualisierung. Lizenz der Ausgangsdaten:{" "}
            <a target='_more' href='https://www.opendatacommons.org/licenses/odbl/1.0/'>
              ODbL
            </a>{" "}
            (OpenStreetMap contributors).
          </p>
        </li>
        <li>
          <p>
            <strong>Luftbildkarte</strong>: (1) Kartendienst (WMS) der Stadt Wuppertal.
            Datengrundlage: True Orthophoto aus Bildflug vom 16.03.2022, hergestellt durch Aerowest
            GmbH/Dortmund, Bodenauflösung 10 cm. (True Orthophoto: Aus Luftbildern mit hoher Längs-
            und Querüberdeckung in einem automatisierten Bildverarbeitungsprozess berechnetes Bild
            in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche.) © Stadt
            Wuppertal (
            <a
              target='_more'
              href='https://www.wuppertal.de/geoportal/Nutzungsbedingungen/NB-GDIKOM-C_Geodaten.pdf'
            >
              NB-GDIKOM C
            </a>
            ). (2) Kartendienste (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlagen: Stadtkarte
            2.0 und Kartenschrift aus der Stadtkarte 2.0. (Details s. Hintergrundkarte Stadtplan).
          </p>
        </li>
      </ul>
      <p>
        Die Vektordaten von &quot;Stadtplan grau&quot; und &quot;Stadtplan bunt&quot; werden beim
        Starten der Anwendung auf das Endgerät übertragen, sofern das Kontrollkästchen
        &quot;Vektorlayer offline verfügbar machen&quot; aktiviert ist. Sie erkennen diesen Zustand
        auch an den Download-Symbolen <FontAwesomeIcon icon={faDownload} /> neben den
        Kartenbezeichnungen. Diese Karten sind daher auch offline (ohne Internetzugang) verfügbar
        (vgl. Absatz{" "}
        <Link
          class='renderAsLink'
          to={slugify("Anmeldung und Offline-Benutzung")}
          containerId={"myMenu"}
          activeClass='active'
        >
          Anmeldung und Offline-Benutzung
        </Link>
        ).
      </p>

      <p>
        Oberhalb der Basiskartenauswahl stehen die als flächendeckende, optionale Überlagerungen der
        Basiskarte angebotenen Fachdaten (Trinkwasserbrunnen, Kanalnetz, Gewässernetz) zur beliebig
        kombinierbaren Auswahl bereit. Auch diese Daten sind offline verfügbar. In der{" "}
        <strong>Vorschau</strong> wird Ihnen anhand eines beispielhaften Kartenausschnitts stets die
        Wirkung Ihrer Basiskarten- und Fachdatenauswahl angezeigt. Die Zeichenerklärung für die
        Kartendarstellung dieser Fachdaten finden Sie im Anwendungsmenü im Abschnitt &quot;
        <strong>Legende der Fachdaten</strong>&quot;. Die Fachdaten werden in der Karte z. T. nur in
        mittleren bis großen Darstellungsmaßstäben angezeigt, die Schachtdeckel des Kanalnetzes z.
        B. erst ab Zoomstufe 20.
      </p>
    </div>
  );
};
export default Hintergrundkarten;
