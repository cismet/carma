import { Link } from "react-scroll";
import slugify from "slugify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMap } from "@fortawesome/free-solid-svg-icons";
const ThematischerDurchstich = () => {
  return (
    <div>
      <p>
        Die angezeigte Karte kann mit gedrückter linker Maustaste verschoben werden (bei
        Touch-Displays entsprechend durch Wischen). Nach jeder Verschiebung des Karteninhaltes
        erfolgt für die Themen mit Flächengeometrien (Schutzkreise von Trinkwasserbrunnen,
        BImschG-Anlagen, Wasserschutzgebiete, Störfallbetriebe, städtische Flurstücke, Landschafts-
        und Naturschutzgebiete sowie zuständiger Wasserverband, zuständige Straßenmeisterei und
        zuständige Autobahnmeisterei) automatisch eine themenübergreifende Abfrage am Mittelpunkt
        des Kartenfensters, der dauerhaft mit einem Fadenkreuz gekennzeichnet ist
        (&quot;thematischer Durchstich&quot;). In der Info-Box (unten rechts) werden stets die
        Symbole derjenigen Kategorien, zu denen sich unter dem Fadenkreuz ein Objekt befindet,
        betont dargestellt und durch eine je nach Kategorie unterschiedliche Kurzinformation ergänzt
        (z. B. bei den Störfallbetrieben Betriebsname und Kategorie (A1 bzw. A2) des
        Achtungsabstandes). Ausgenommen sind hier die Kategorien Wasserverband, Straßenmeisterei und
        Autobahnmeisterei. Bei den BImschG-Anlagen und den Schutzkreisen von Trinkwasserbrunnen
        enthält die Kurzinformation immer den Abstand der Abfrageposition zum Mittelpunkt der
        kreisförmigen Flächen und ggf. die Anzahl weiterer Treffer in dieser Kategorie (z. B.
        &quot;(+2)&quot; bei insgesamt 3 Treffern). Die Gesamtanzahl der beim thematischen
        Durchstich gefundenen Objekte einschließlich der Kategorien Wasserverband, Straßenmeisterei
        und Autobahnmeisterei wird in der Titelzeile der Info-Box als &quot;Analyseergebnis
        (Fadenkreuz)&quot; angezeigt. Durch Anklicken bzw. Antippen der Schaltfläche{" "}
        <FontAwesomeIcon icon={faMap} /> &quot;in Karte anzeigen&quot; oberhalb der Info-Box
        aktivieren Sie einen Modus, in dem die aktuellen Treffer des thematischen Durchstichs in der
        Karte als flächenhafte, leicht transparente Überlagerungen ausgeprägt werden, wobei auch
        hier auf die Darstellung der Objekte aus den Kategorien Wasserverband, Straßenmeisterei und
        Autobahnmeisterei verzichtet wird. In diesem Modus wird die Schaltfläche &quot;in Karte
        anzeigen&quot; mit einem grünen Hintergrund dargestellt. Durch ein erneutes Anklicken bzw.
        Antippen der Schaltfläche wird wieder in den Standard-Modus ohne Kartendarstellung der
        Flächenobjekte zurück gewechselt.{" "}
      </p>
    </div>
  );
};
export default ThematischerDurchstich;
