import { Link } from "react-scroll";
import slugify from "slugify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronCircleDown, faChevronCircleUp } from "@fortawesome/free-solid-svg-icons";
const Infobox = () => {
  return (
    <div>
      <p>
        Durch Anklicken bzw. Antippen einer beliebigen Stelle der Info-Box (unten rechts) öffnen Sie
        ein Fenster mit einer Datenblattansicht, in der alle in der Umweltalarm-Anwendung
        verfügbaren Informationen zu den aktuellen Treffern des thematischen Durchstichs
        zusammengestellt sind. Das Datenblatt umfasst auch die Informationen zu den Objekten aus den
        Kategorien Wasserverband, Strassenmeisterei und Autobahnmeisterei. Das Datenblatt ist in die
        beiden Blöcke &quot;Zuständigkeiten&quot; (Treffer aus den Kategorien Wasserverband,
        Strassenmeisterei, Autobahnmeisterei und Städtische Flurstücke) sowie &quot;Schutzgebiete
        und Anlagen&quot; (Treffer aus den Kategorien Schutzkreise von Trinkwasserbrunnen,
        BImschG-Anlagen, Wasserschutzgebiete, Störfallbetriebe, Landschafts- und Naturschutzgebiete
        ) gegliedert. Die beiden Blöcke lassen sich durch Anklicken bzw. Antippen der Überschriften
        in den farbig unterlegten Titelbereichen ein- und wieder ausklappen. Die Informationen zu
        den einzelnen Objekten umfassen insbesondere Telefon- und E-Mail-Verknüpfungen, damit
        der/die Diensthabende im Einsatzfall unmittelbar Kontakt zu den jeweils zuständigen Behörden
        aufnehmen kann. Bei Nutzung eines entsprechend ausgestatteten mobilen Endgeräts, z. B. eines
        Smartphones, kann über den Telefon-Link direkt ein Sprachanruf eingeleitet werden.
      </p>
      <p>
        Mit der Schaltfläche <FontAwesomeIcon icon={faChevronCircleDown} /> im dunkelgrau
        abgesetzten rechten Rand der Info-Box lässt sich diese ohne Informationsverlust so
        verkleinern, dass die Symbole zu allen sechs Kategorien in einer Zeile dargestellt werden -
        nützlich für Endgeräte mit kleinem Display. Mit der Schaltfläche{" "}
        <FontAwesomeIcon icon={faChevronCircleUp} /> an derselben Stelle können Sie die Info-Box
        dann wieder in das ursprüngliche zweizeilige Layout zurückversetzen.
      </p>
    </div>
  );
};
export default Infobox;
