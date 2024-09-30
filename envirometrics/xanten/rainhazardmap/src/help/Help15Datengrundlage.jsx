import React, { useContext } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
import LicenseLBK from "react-cismap/topicmaps/wuppertal/LicenseLuftbildkarte";
import LicenseStadtplanTagNacht from "react-cismap/topicmaps/wuppertal/LicenseStadtplanTagNacht";

/* eslint-disable jsx-a11y/anchor-is-valid */

const Component = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <GenericModalMenuSection
      sectionKey="datengrundlage"
      sectionTitle="Datengrundlagen"
      sectionBsStyle="warning"
      sectionContent={
        <div>
          <p>
            Die Modellgrundlagen und -annahmen beeinflussen die Ergebnisse
            maßgeblich. Die hierausresultierende{" "}
            <a
              className="renderAsLink"
              onClick={() => setAppMenuActiveMenuSection("aussagekraft")}
            >
              Aussagekraft der Simulationen
            </a>{" "}
            wird gesondert beschrieben.
          </p>

          <p>
            Die Simulationen wurden mit einem Oberflächenabflussmodell für das
            hydrologische Einzugsgebiet der Stadt Xanten mit einer Auflösung von 1x1 Meter
            aufgebaut. Wesentliche Modellgrundlage ist das Digitale
            Geländemodell (DGM1). Als Grundlage hierfür dienen flächenhafte
            Höhenmessungen, die das Land NRW turnusmäßig mit einem Laserscanner
            aus einem Flugzeug heraus durchführt (Aufnahme durch Laseraltimetrie
            im Jahr 2014 und 2020). Für die Simulation wurde das DGM1 um die
            Gebäude aus dem Liegenschaftskataster (01/2022) ergänzt. Der Rhein führte bei der Messung am 07.02.2020 Hochwasser wodurch der Rhein an sich sehr hohe Wasserstände aufwies und das Vorland / Alter Rhein überschwemmt war.
            Infolgedessen wurde in diesem Bereich der Wasserstand und nicht die Geländeoberfläche erfasst, wodurch es zu Höhenabweichungen 
            im digitalen Geländemodell gekommen ist. Daher wird dieser Bereich im AIS Starkregenvorsorge Xanten ausgeblendet. 
            Flüsse wie der Rhein weisen eine relativ hohe Abflussleistung auf und reagieren eher auf langanhaltende und großräumige Niederschläge mit Hochwasser.
            Überschwemmungen durch den Rhein werden in den Hochwassergefahrenkarten abgebildet. 
            Im AIS dargestellte kurze und lokale Starkregenereignisse (Dauer 60 min) wirken sich hingegen stärker auf kleinere Gewässer aus und führen in urbanen Räumen zu Überflutungen. 
          </p>

          <p>
            Das Oberflächenmodell wurde anschließend um wichtige verrohrte
            Gewässerabschnitte sowie Geländedurchlässe ergänzt, um eine
            hydrologisch korrekte Abbildung von potenziellen Fließwegen zu gewährleisten. In diesem
            Rahmen wurden auch weitere Fließhindernisse wie z. B. Mauern ergänzt
            und maßgebliche siedlungswasserwirtschaftliche Bauwerke (Hochwasser-
            und Regenrückhaltebecken) mit ihrer Wirkung im Oberflächenmodell
            abgebildet. Zusätzlich wurden die Gebäude auf Aktualität geprüft und
            abgerissene oder geplante Gebäude gegebenenfalls angepasst. Sehr
            neue Gebäude, die nach dem Modellaufbau fertiggestellt wurden (z. B.
            Neubaugebiete) sind daher noch nicht im Datenbestand erfasst. Hier
            lassen sich aus dem angrenzenden Gelände dennoch wichtige Hinweise
            zur möglichen Überflutung ableiten (s. auch Schaltfläche: Fehler im
            Geländemodell melden).
          </p>

          <p>
            Grundlage für die Modellanpassungen waren die kommunal verfügbaren
            Datensätze, Ortsbegehungen im Stadtgebiet und eine Prüfung durch
            Mitarbeiterinnen und Mitarbeiter der Stadt Xanten (DBX).
          </p>

          <p>Welche Daten wurden berücksichtigt?</p>

          <ul>
            <li>
              Landesweite Daten / Bezirksregierung Köln: Digitales
              Geländemodell, Digitales Lanschaftsmodell, ALKIS-Daten,
              ELWAS-Daten (Datenlizenz Deutschland Zero
              (https://www.govdata.de/dl-de/zero-2-0))
            </li>

            <li>Stadt Xanten/DBX: Dokumentation Ereignis 2016, Informationen aus dem Generalentwässerungsplan (GEP) zu Überstauschächten, darüber hinaus erfolgte eine weitergehende Datenerfassung und Modellprüfung in einer Online-Karte.</li>

            <li>Linksniederrheinische Entwässerungs-Genossenschaft: Bauwerksinformationen, Einbauten, Verrohrungen</li>
          </ul>

          <p>
            Zur Betrachtung der Ergebnisse stehen drei verschiedene
            Hintergrundkarten zur Verfügung, die auf den folgenden
            Geodatendiensten und Geodaten basieren:
          </p>
          <ul>
            <li>
              <strong>Stadtplan (grau)</strong>: Kartendienst (vektorbasiert)
              der cismet GmbH. Datengrundlage: <strong>cismet light</strong>.
              Wöchentlich in einem automatischen Prozess aktualisierte
              Bereitstellung der OpenStreetMap als Vektorlayer mit der
              OpenMapTiles-Server-Technologie. Lizenzen der Ausgangsprodukte:{" "}
              <a
                target="_legal"
                href="https://github.com/openmaptiles/openmaptiles/blob/master/LICENSE.md"
              >
                Openmaptiles
              </a>{" "}
              und{" "}
              <a
                target="_legal"
                href="https://www.opendatacommons.org/licenses/odbl/1.0/"
              >
                ODbL
              </a>{" "}
              (OpenStreetMap contributors).
            </li>
            <li>
              <strong>Luftbildkarte</strong>: (1) Kartendienst (WMS) des Landes NRW.
              Datengrundlage:{" "}
              <strong>Digitale Orthophotos (DOP) des Landes NRW</strong>{" "}
              WMS-Dienst für farbige, digitale, georeferenzierte, lagegenaue,
              entzerrte Luftbilder des Landes NRW. (
              <a
                target="_legal"
                href="https://www.bezreg-koeln.nrw.de/geobasis-nrw/produkte-und-dienste/luftbild-und-satellitenbildinformationen/aktuelle-luftbild-und-0"
              >
                weitere Informationen
              </a>
              ). (2) Kartendienste (WMS) des Regionalverbandes Ruhr (RVR). 
              Datengrundlagen: <strong>Stadtkarte 2.0</strong> Wöchentlich in einem automatischen Prozess 
              aktualisierte Zusammenführung des Straßennetzes der OpenStreetMap mit 
              Amtlichen Geobasisdaten des Landes NRW aus den Fachverfahren ALKIS 
              (Gebäude, Flächennutzungen) und ATKIS (Gewässer). © RVR und 
              Kooperationspartner 
              (
              <a
                target="_legal"
                href="https://www.govdata.de/dl-de/by-2-0"
              >
                Datenlizenz Deutschland - Namensnennung - Version 2.0
              </a>
              ). 
              Lizenzen der Ausgangsprodukte: 
              (
              <a
                target="_legal"
                href="https://www.govdata.de/dl-de/zero-2-0"
              >
                Datenlizenz Deutschland - Zero - Version 2.0
              </a>
              ) 
              (Amtliche Geobasisdaten) und ODbL 
              (
              <a
                target="_legal"
                href="https://opendatacommons.org/licenses/odbl/1-0/"
              >
                OpenStreetMap contributors
              </a>
              )
              .
            </li>
            <li>
              <strong>DTK (schwarz-weiß)</strong>: DTK Sammeldienst des Landes NRW.
              Datengrundlage: <strong>DTK (schwarz-weiß)</strong> Dieser Dienst enthält
              alle topographischen Kartenwerke des Landes Nordrhein-Westfalen
              sowie in den kleineren Maßstäben topographische Kartenwerke des
              Bundes. Angefangen von einer Übersichtskarte für NRW über die
              DTK500 bis zur DTK250 des Bundesamtes für Kartographie und
              Geodäsie und den topographischen Karten DTK100, DTK50, DTK25,
              DTK10 NRW von Geobasis NRW, bis hin zur ABK und ALKIS der Kommunen
              sind alle Standardkartenwerke in einem Layer vereint. Durch die
              voreingestellten Maßstabsbereiche wird gewährleistet, dass in
              jedem Maßstab die ideale Karte präsentiert wird.
              Nutzungsbedingungen: siehe{" "}
              <a
                target="_legal"
                href="https://www.bezreg-koeln.nrw.de/system/files/media/document/file/lizenzbedingungen_geobasis_nrw.pdf"
              >
                Nutzungsbedingungen Geobasis NRW
              </a>
              , Für die DTK 250, DTK 500 gelten die Nutzungsbedingungen des BKG:
              ©{" "}
              <a 
              target="_legal" 
              href="https://www.govdata.de/dl-de/by-2-0"
              >
                GeoBasis-DE / BKG(2020) dl-de/by-2-0
              </a>
            </li>
          </ul>
        </div>
      }
    />
  );
};
export default Component;
