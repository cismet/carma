const Fachdatenquellen = () => {
  return (
    <div>
      <p>
        Die Anwendung basiert auf 12 Geofachdatensätzen von unterschiedlichen
        Dienststellen. Die nachfolgenden Listen geben einen kurzen Überblick
        über die Herkunft dieser Datensätze und das jeweilige
        Aktualisierungsverfahren. Außerdem werden ggf. Hinweise zu
        Qualitätsmängeln oder Eigenheiten der Datensätze gegeben, die für die
        Interpretation der örtlichen Situation relevant sein können.
      </p>
      <p>
        Die folgenden Datensätze werden vom Herausgeber als Open Data
        publiziert, zu ihnen können daher detaillierte Informationen im jeweils
        verlinkten Open-Data-Portal abgerufen werden:
      </p>
      <ul>
        <li>
          <strong>Landschaftsschutzgebiete</strong>: Herausgeber Stadt Wuppertal
          (
          <a
            target="_more"
            href="https://offenedaten-wuppertal.de/dataset/landschaftsschutzgebiete-wuppertal"
          >
            https://offenedaten-wuppertal.de/dataset/landschaftsschutzgebiete-wuppertal
          </a>
          ){" "}
        </li>
        <li>
          <strong>Naturschutzgebiete</strong>: Herausgeber Stadt Wuppertal (
          <a
            target="_more"
            href="https://offenedaten-wuppertal.de/dataset/naturschutzgebiete-wuppertal"
          >
            https://offenedaten-wuppertal.de/dataset/naturschutzgebiete-wuppertal
          </a>
          ){" "}
        </li>
      </ul>
      <p>
        Die folgenden Datensätze werden aktuell noch nicht als Open Data
        publiziert:
      </p>
      <ul>
        <li>
          <strong>Trinkwasserbrunnen</strong>: Datenführung bei{" "}
          <a target="_more" href="https://www.wuppertal.de/vv/oe/305.8.php">
            305.8
          </a>{" "}
          | Punktgeometrien i. d. R. an der Position des Brunnens |
          Bereitstellung nach Einzelabruf durch{" "}
          <a target="_more" href="https://www.wuppertal.de/vv/oe/106.29.php">
            106.29
          </a>{" "}
        </li>
        <li>
          <strong>Kanalnetz</strong>: Datenexport aus Kanalinformationssystem
          der Wuppertaler Stadtwerke WSW Energie und Wasser AG | durch örtliche
          Vermessung bestimmte Lagegeometrie | Bereitstellung nach Einzelabruf
          durch{" "}
          <a target="_more" href="https://www.wuppertal.de/vv/oe/106.29.php">
            106.29
          </a>
        </li>
        <li>
          <strong>Gewässernetz</strong>: Datenexporte aus
          Fließgewässerinformationssystemen des Wupperverbandes und des
          Bergisch-Rheinischen Wasserverbandes | laufende Datenabgleiche aus
          Ortsbegehungen und Feldvermessungen von Wasserverbänden und{" "}
          <a target="_more" href="https://www.wuppertal.de/vv/oe/106.29.php">
            106.29
          </a>{" "}
          /{" "}
          <a target="_more" href="https://www.wuppertal.de/vv/oe/106.02.php">
            106.02
          </a>{" "}
          | Bereitstellung nach Einzelabruf durch{" "}
          <a target="_more" href="https://www.wuppertal.de/vv/oe/106.29.php">
            106.29
          </a>
        </li>
        <li>
          <strong>BImschG-Anlagen</strong>: Unregelmäßiger Datenexport aus
          Landesverfahren{" "}
          <a
            target="_more"
            href="https://www.lanuv.nrw.de/umwelt/industrieanlagen/mehr-zum-thema/anlagen-informationssysteme/isahtm"
          >
            Informationssystem Stoffe und Anlagen (ISA)
          </a>{" "}
          durch{" "}
          <a
            target="_more"
            href="https://www.wuppertal.de/vv/oe/106.28_Immissionsschutz___Betrieblicher_Umweltschutz.php"
          >
            106.28
          </a>{" "}
          | Bereitstellung nach Einzelabruf durch{" "}
          <a target="_more" href="https://www.wuppertal.de/vv/oe/106.29.php">
            106.29
          </a>{" "}
        </li>
        <li>
          <strong>Wasserschutzgebiete</strong>: Datenbereitstellung durch
          Bezirksregierung Düsseldorf | in Wuppertal Bestandteil der
          FNP-Arbeitskarte | Abruf aktualisierter Daten nach Veröffentlichung
          von Änderungen im Amtsblatt der Bezirksregierung, wöchentliche
          Kontrolle durch{" "}
          <a href="https://www.wuppertal.de/vv/oe/102.1302.php">102.1302</a>
        </li>
        <li>
          <strong>Störfallbetriebe</strong>: Achtungsabstände (angemessene
          Planungsabstände zu Störfallbetrieben für schutzbedürftige Nutzungen)
          A1 (Ermittlung mit Detailkenntnissen im Jahr 2014 durch Gutachten des
          TÜV Nord im Auftrag der Stadt Wuppertal) bzw. A2 (Ermittlung ohne
          Detailkenntnisse durch das{" "}
          <a target="_more" href="https://www.lanuv.nrw.de/">
            LANUV
          </a>
          ), jeweils in Anlehnung an den Leitfaden{" "}
          <a
            target="_more"
            href="https://www.kas-bmu.de/kas-leitfaeden-arbeits-und-vollzugshilfen.html?file=files/publikationen/KAS-Publikationen/Leitfaeden%2C%20Arbeits-%20und%20Vollzugshilfen/KAS_18.pdf&amp;cid=1535"
          >
            KAS 18
          </a>{" "}
          | Bereitstellung der Daten für die verwaltungsinterne Nutzung durch{" "}
          <a target="_more" href="https://www.wuppertal.de/vv/oe/105.1.php">
            105.1
          </a>
        </li>
        <li>
          <strong>Städtische Flurstücke</strong>: Filterung des tagesaktuellen{" "}
          <a
            target="_more"
            href="https://www.bezreg-koeln.nrw.de/brk_internet/geobasis/liegenschaftskataster/alkis/index.html"
          >
            ALKIS
          </a>
          -Flurstücksdatenbestandes aus dem WuNDa nach den im
          Lagerbuchinformationssystem LagIS geführten Zuordnungen von
          städtischen Dienststellen | Bereitstellung und automatisierte
          Aktualisierung durch{" "}
          <a target="_more" href="https://www.wuppertal.de/vv/oe/102.34.php">
            102.34{" "}
          </a>
        </li>
        <li>
          <strong>Wasserverband</strong>: festgesetzte Einzugsgebietsgrenzen der
          Wasserverbände (Polygone) | Bereitstellung durch Wupperverband und
          Bergisch-Rheinischen Wasserverband nach Abruf durch{" "}
          <a target="_more" href="https://www.wuppertal.de/vv/oe/106.29.php">
            106.29
          </a>
          , Daten sind praktisch statisch und erfordern keine Aktualisierung{" "}
        </li>
        <li>
          <strong>Autobahnmeisterei / Straßenmeisterei</strong>:
          Zuständigkeitsbereiche der Dienststellen des Landesbetriebs Straßenbau
          NRW (
          <a target="_more" href="https://www.strassen.nrw.de/de/">
            Straßen.NRW
          </a>
          ) für Bundesautobahnen, Bundes-, Landes- und Kreisstraßen (Polygone) |
          Bereitstellung durch Straßen.NRW nach Abruf durch{" "}
          <a target="_more" href="https://www.wuppertal.de/vv/oe/106.29.php">
            106.29
          </a>
          , Daten sind praktisch statisch und erfordern keine Aktualisierung{" "}
        </li>
      </ul>
    </div>
  );
};
export default Fachdatenquellen;
