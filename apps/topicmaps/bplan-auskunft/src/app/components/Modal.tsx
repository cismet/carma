import ModalApplicationMenu from 'react-cismap/topicmaps/menu/ModalApplicationMenu';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';
import { useContext } from 'react';
import Section from 'react-cismap/topicmaps/menu/Section';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationArrow } from '@fortawesome/free-solid-svg-icons';
import meinStandpunktMarkerDoppel from './MeinStandpunktMarkerDoppel.jpg';
import meinStandpunktMarkerMitKompass from './MeinStandpunktMarkerMitKompass.jpg';
import Icon from 'react-cismap/commons/Icon';

const Modal = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  return (
    <ModalApplicationMenu
      menuIcon={'info'}
      menuTitle={'Kompaktanleitung B-Plan-Auskunft Wuppertal'}
      menuIntroduction={
        <span>
          Bitte klicken Sie auf eine der Kapitelüberschriften in den farbig
          unterlegten Bereichen, um sich weitere Informationen zu dem
          entsprechenden Thema anzeigen zu lassen:
        </span>
      }
      menuSections={[
        <Section
          key="warning"
          sectionKey="hintergrundkarte"
          sectionTitle="Hintergrundkarte"
          sectionBsStyle="warning"
          sectionContent={
            <div>
              <p>
                <strong>Hintergrundkarte</strong>
              </p>
              <p>
                Die Hintergrundkarte gibt eine Übersicht über die Wuppertaler
                Bebauungspläne (B-Pläne). Grüne Flächen (Übersichtsmaßstab) bzw.
                Umringe stehen für rechtswirksame B-Plan-Verfahren, rote Flächen
                / Umringe für laufende Verfahren.
              </p>
              <p>
                Die Hintergrundkarte basiert auf den folgenden Kartendiensten
                und Daten, die maßstabsabhängig angesprochen werden:
              </p>
              <ul>
                <li>
                  <strong>Stadtplan, in allen Maßstäben</strong>: Kartendienst
                  (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlage:{' '}
                  <strong>Stadtkarte 2.0</strong>. Wöchentlich in einem
                  automatischen Prozess aktualisierte Zusammenführung des
                  Straßennetzes der OpenStreetMap mit Amtlichen Geobasisdaten
                  des Landes NRW aus den Fachverfahren ALKIS (Gebäude,
                  Flächennutzungen) und ATKIS (Gewässer). © RVR und
                  Kooperationspartner (
                  <a
                    href="https://www.govdata.de/dl-de/by-2-0"
                    target="_license"
                  >
                    Datenlizenz Deutschland - Namensnennung - Version 2.0
                  </a>
                  ). Lizenzen der Ausgangsprodukte:{' '}
                  <a
                    href="https://www.govdata.de/dl-de/zero-2-0"
                    target="_license"
                  >
                    Datenlizenz Deutschland - Zero - Version 2.0
                  </a>{' '}
                  (Amtliche Geobasisdaten) und{' '}
                  <a
                    href="https://www.opendatacommons.org/licenses/odbl/1.0/"
                    target="_license"
                  >
                    ODbL
                  </a>{' '}
                  (OpenStreetMap contributors).
                </li>
                <li>
                  <strong>Amtliche Basiskarte ABK, in Detailmaßstäben</strong>:
                  Kartendienst (WMS) der Stadt Wuppertal. Datengrundlage:
                  Amtliche Basiskarte ABK Graustufen. (Wöchentlich in einem
                  automatisierten Prozess aus dem Fachverfahren ALKIS des
                  Liegenschaftskatasters abgeleitete großmaßstäbige
                  topographische Karte in Graustufen.) © Stadt Wuppertal (
                  <a
                    href="https://www.govdata.de/dl-de/zero-2-0"
                    target="_license"
                  >
                    Datenlizenz Deutschland - Zero - Version 2.0
                  </a>
                  ).
                </li>
                <li>
                  <strong>WebAtlasDE, in Übersichtsdarstellungen</strong>:
                  Kartendienst (WMS) des Bundesamtes für Kartographie und
                  Geodäsie (BKG). Datengrundlage: WebAtlasDE © GeoBasis-DE / BKG
                  2018
                </li>
                <li>
                  <strong>B-Plan-Geltungsbereiche, in allen Maßstäben</strong>:
                  Kartendienst (WMS) der Stadt Wuppertal. Datengrundlage:
                  Geltungsbereiche der Wuppertaler{' '}
                  <a
                    href="https://offenedaten-wuppertal.de/dataset/rechtsverbindliche-bebauungspl%C3%A4ne-wuppertal"
                    target="_license"
                  >
                    rechtsverbindlichen Bebauungspläne
                  </a>{' '}
                  und der{' '}
                  <a
                    href="https://offenedaten-wuppertal.de/dataset/laufende-bebauungsplanverfahren-wuppertal"
                    target="_license"
                  >
                    laufenden Bebauungsplan-Verfahren
                  </a>{' '}
                  aus dem Open-Data-Angebot der Stadt Wuppertal. © Stadt
                  Wuppertal (CC BY-ND 4.0)
                </li>
              </ul>
            </div>
          }
        />,
        <Section
          key="standort"
          sectionKey="standort"
          sectionTitle="Mein Standort"
          sectionBsStyle="warning"
          sectionContent={
            <>
              <p>
                Das Werkzeug &quot;Mein Standort&quot;{' '}
                <FontAwesomeIcon icon={faLocationArrow} /> funktioniert so wie
                hier beschrieben nur auf mobilen Endgeräten wie Smartphones und
                Tablet-PC&#39;s, die i. d. R. mit einem GNSS-Empfänger als
                Positionssensor ausgestattet sind. (GNSS steht für Global
                Navigation Satellite Systems, z. B.{' '}
                <a
                  target="_info"
                  href="https://dvw.de/sites/default/files/landesverein-bayern/VeroeffentlichungenMitteilungen1996_4/DVW_1996_4_Schlie%C3%9Fer_GPS_Systemgrundlagen.pdf"
                >
                  GPS
                </a>
                .) Mit dem ersten Antippen dieses Werkzeugs aktivieren Sie den
                &quot;Follow me&quot;-Modus, erkennbar an der orangefarbigen
                Darstellung des Werkzeug-Symbols. Ggf. werden Sie vom Browser
                bzw. dem Betriebssystem ihres Endgerätes zur Freigabe der
                Lokalisierung aufgefordert. Die Karte wird auf Ihren aktuellen
                Standort zentriert, der mit einem blauen Kreissymbol{' '}
                <img
                  alt="MeinStandpunktMarker"
                  src={meinStandpunktMarkerMitKompass}
                />{' '}
                markiert wird. Das kleine blaue Dreieck am Rand dieses
                Standortsymbols zeigt Ihre aktuelle Blickrichtung an (genauer:
                die Richtung, in die ihr Endgerät zeigt). Das Standortsymbol ist
                umgeben von einem zweiten Kreis mit transparenter, blauer
                Füllung, dessen Radius die Unsicherheit der Positionsbestimmung
                angibt{' '}
                <img
                  alt="MeinStandpunktMarkerDoppel"
                  src={meinStandpunktMarkerDoppel}
                />
                . Durch Antippen dieses Kreises können Sie einen Texthinweis mit
                einer konkreten Angabe der aktuellen Positionsgenauigkeit
                einblenden. Dieser Hinweis kann durch das Antippen einer
                beliebigen Stelle außerhalb seines Textfeldes geschlossen
                werden. Wenn Sie sich mit ihrem Endgerät bewegen (z. B. bei
                einer Wanderung), wird ihre aktuelle Position im &quot;Follow
                me&quot;-Modus in schneller Folge neu bestimmt und stets in der
                Mitte der Karte angezeigt. Die Karte wird dazu automatisiert
                nachgeführt. Ein weiteres Antippen von &quot;Mein Standort&quot;
                schaltet die Anzeige Ihrer Position wieder ab (schwarzes
                Werkzeug-Symbol).{' '}
              </p>
              <p>
                Wenn Sie die Karte im aktivierten &quot;Follow me&quot;-Modus
                manuell verschieben, wird der &quot;Follow me&quot;-Modus
                unterbrochen, erkennbar an einer blauen Darstellung des
                Werkzeug-Symbols. Ihr aktueller Standort wird weiterhin
                angezeigt und in schneller Folge aktualisiert. Der
                Kartenausschnitt wird jetzt aber nicht mehr automatisch an den
                aktuellen Standort angepasst. Bei fortgesetzter Bewegung in eine
                Richtung wird das Standortsymbol daher vom Zentrum zum Rand des
                Kartenfensters wandern und dann verschwinden - Ihr Standort
                liegt jetzt nicht mehr im aktuell eingestellten
                Kartenausschnitt! In diesem Fall führt ein erneutes Antippen von
                &quot;Mein Standort&quot; dazu, dass wieder in den &quot;Follow
                me&quot;-Modus zurückgewechselt wird. Wenn ihr aktueller
                Standort dagegen noch in der Karte sichtbar ist, wird durch
                diese Aktion die Anzeige der Position abgeschaltet (schwarzes
                Werkzeug-Symbol). Sie können die Unterbrechung des &quot;Follow
                me&quot;-Modus bei einer Wanderung o. ä. nutzen, wenn Sie sich
                die vor Ihnen liegende Strecke in der Karte anschauen wollen.
                Verschieben Sie dazu den Kartenausschnitt manuell auf den
                Abschnitt ihres Interesses. Ihr aktueller Standort wird dann
                zumeist nicht mehr dargestellt werden können. Der &quot;Follow
                me&quot;-Modus wird unterbrochen (blaues Werkzeug-Symbol). Wenn
                Sie sich ausreichend über den weiteren Streckenverlauf
                informiert haben, reaktivieren Sie durch erneutes Antippen von
                &quot;Mein Standort&quot; den &quot;Follow me&quot;-Modus und
                setzen die Karte damit wieder auf Ihren aktuellen Standort
                zurück.{' '}
              </p>
              <p>
                Noch ein Hinweis zur Genauigkeit: Die Richtigkeit der
                Positionsanzeige ist nicht garantiert. Ihre Genauigkeit hängt
                von verschiedenen Faktoren ab, u. a. von der Qualität des
                GNSS-Empfängers in Ihrem Endgerät, der Umgebungssituation (z. B.
                hohe Gebäude oder spiegelnde Oberflächen in der Nachbarschaft)
                sowie der Methode, mit der ihr Endgerät und der von Ihnen
                verwendete Browser die Position bestimmen.
              </p>
            </>
          }
        />,
        <Section
          key="bplaene-suchen"
          sectionKey="bplaene-suchen"
          sectionTitle="B-Pläne suchen"
          sectionBsStyle="success"
          sectionContent={
            <div>
              <p>
                F&uuml;r Detailinformation, Dokumentbetrachtung und Download
                m&uuml;ssen Sie zun&auml;chst nach B-Pl&auml;nen suchen. Die
                Treffer werden automatisch geladen und in der Karte als
                transparente farbige Fl&auml;chen mit der B-Plan-Nummer in jeder
                Teilfl&auml;che dargestellt (Geltungsbereiche der B-Pl&auml;ne).
              </p>
              <p>
                Gr&uuml;ne Fl&auml;chen/Nummern stehen f&uuml;r rechtswirksame
                Verfahren, rote Fl&auml;chen/Nummern f&uuml;r laufende. Eine
                gr&uuml;ne Fl&auml;che mit roter Nummer bedeutet, dass es unter
                dieser Nummer ein rechtswirksames und ein laufendes Verfahren
                gibt, die genau dasselbe Gebiet abdecken.
              </p>
            </div>
          }
        />,
        <Section
          key="suche-im-kartenausschnitt"
          sectionKey="suche-im-kartenausschnitt"
          sectionTitle="Suche im Kartenausschnitt"
          sectionBsStyle="success"
          sectionContent={
            <div>
              <p>
                Durch Anklicken von&nbsp;
                <Icon name="search" />
                &nbsp;suchen Sie nach B-Pl&auml;nen, die zumindest teilweise im
                aktuellen Kartenausschnitt liegen.
              </p>
              <p>
                Den Kartenausschnitt k&ouml;nnen Sie durch Ziehen mit der Maus
                verschieben. Mit den Werkzeugen&nbsp;
                <Icon name="plus" />
                &nbsp;und&nbsp;
                <Icon name="minus" />
                &nbsp;k&ouml;nnen Sie den Kartenma&szlig;stab
                vergr&ouml;&szlig;ern bzw. verkleinern.
              </p>
              <p>
                Mit einem Doppelklick auf einen B-Plan in der Hintergrundkarte
                werden alle B-Pl&auml;ne geladen, die an dieser Stelle liegen -
                meistens genau einer, manchmal auch mehrere Pl&auml;ne. Ein
                Doppelklick auf die Hintergrundkarte <b>au&szlig;erhalb</b> der
                angezeigten B-Pl&auml;ne entfernt alle zuvor geladenen
                B-Pl&auml;ne (Zur&uuml;cksetzen der Suche).
              </p>
            </div>
          }
        />,
        <Section
          key="suche-ueber-bplan-nummer"
          sectionKey="suche-ueber-bplan-nummer"
          sectionTitle="Suche über B-Plan-Nummer"
          sectionBsStyle="success"
          sectionContent={
            <div>
              <p>
                Um ein B-Plan-Verfahren direkt anzusteuern, geben Sie den Anfang
                der B-Plan-Nummer im Eingabefeld rechts neben&nbsp;
                <Icon name="search" />
                &nbsp;ein (mindestens 2 Ziffern). Alle Verfahren, die mit diesen
                Ziffern beginnen, werden Ihnen in einer inkrementellen
                Auswahlliste angeboten. (Wenn Sie weitere Zeichen eingeben, wird
                der Inhalt der Auswahlliste angepasst.)
              </p>
              <p>
                Nach Auswahl eines B-Plan-Verfahrens aus dieser Liste wird
                ausschlie&szlig;lich der zugeh&ouml;rige Plan geladen. Er wird
                vollst&auml;ndig und zentriert dargestellt. Das ist vor allem
                n&uuml;tzlich, um sich einen &Uuml;berblick &uuml;ber Pl&auml;ne
                mit einem komplizierten Geltungsbereich zu verschaffen.
                (Probieren Sie mal die Nummer 150.)
              </p>
              <p>
                Nach einer solchen Positionierung in der Karte über die
                B-Plan-Nummer können Sie die Suche mit dem Werkzeug{' '}
                <Icon name="times" /> links neben dem Eingabefeld zurücksetzen
                (Entfernung von Marker bzw. Abdunklung, Löschen des Textes im
                Eingabebereich). Es wird Ihnen danach an dieser Stelle wieder
                das Werkzeug <Icon name="search" /> angeboten, mit dem Sie im
                aktuellen Kartenausschnitt nach B-Plänen suchen können.
              </p>
              <p>
                Klicken Sie nun auf <Icon name="search" />, um alle Pl&auml;ne
                hinzuzuladen, die im jetzt aktuellen Ausschnitt liegen. Damit
                stellen Sie auch sicher, dass Sie keinen Plan &uuml;bersehen,
                der sich mit dem zuvor gesuchten &uuml;berlappt.
              </p>
            </div>
          }
        />,
        <Section
          key="suche-ueber-adresse-oder-poi"
          sectionKey="suche-ueber-adresse-oder-poi"
          sectionTitle="Suche über Adresse oder POI"
          sectionBsStyle="success"
          sectionContent={
            <div>
              <p>
                Um die B-Plan-Situation an einem bestimmten Punkt des
                Stadtgebietes zu erkunden, geben Sie den Anfang eines
                Stra&szlig;ennamens oder eines interessanten Ortes (auch Point
                of Interest oder kurz POI genannt) im Eingabefeld ein
                (mindestens 2 Zeichen). In der inkrementellen Auswahlliste
                werden Ihnen passende Treffer angeboten. (Wenn sie weitere
                Zeichen eingeben, wird der Inhalt der Auswahlliste angepasst.)
              </p>
              <p>
                Durch das vorangestellte Symbol erkennen Sie, ob es sich dabei
                um eine&nbsp;
                <Icon name="home" />
                &nbsp;Adresse, eine&nbsp;
                <Icon name="road" />
                &nbsp;Stra&szlig;e ohne zugeordnete Hausnummern, einen&nbsp;
                <Icon name="tag" />
                &nbsp;POI, die&nbsp;
                <Icon name="tags" />
                &nbsp;alternative Bezeichnung eines POI oder eine{' '}
                <Icon name="graduation-cap" /> Schule handlet. (Probieren Sie es
                mal mit der Eingabe "Sankt".)
              </p>
              <p>
                Nach der Auswahl eines Eintrags wird die entsprechende Position
                in der Karte markiert. B-Plan-Verfahren werden hier allerdings
                in der Umgebung dieses Punktes gesucht, in einem
                Kartenausschnitt der Zoomstufe 14. Sie erhalten daher in der
                Regel mehrere Treffer.
              </p>
              <p>
                Auch nach einer Positionierung in der Karte über Adresse oder
                POI können Sie die Suche mit dem Werkzeug <Icon name="times" />{' '}
                links neben dem Eingabefeld zurücksetzen (s.{' '}
                <a
                  onClick={() =>
                    setAppMenuActiveMenuSection('suche-ueber-bplan-nummer')
                  }
                >
                  Suche über B-Plan-Nummer
                </a>
                ).
              </p>
            </div>
          }
        />,
        <Section
          key="treffermenge-durchmustern"
          sectionKey="treffermenge-durchmustern"
          sectionTitle="Treffermengen durchmustern"
          sectionBsStyle="info"
          sectionContent={
            <div>
              <p>
                Der beste Treffer einer Suche erhält den Fokus (blaue
                Umrandung). In der Info-Box werden Ihnen immer die
                Detailinformationen und die Verknüpfung zur Dokumentbetrachtung
                für denjenigen B-Plan angeboten, der gerade den Fokus hat.
              </p>
              <p>
                Der farbige Titelbalken der Info-Box greift für den
                Verfahrensstand (Grobkategorie) des B-Plans die Farbsystematik
                der Kartendarstellung auf: Grün für rechtswirksame Pläne, Rot
                für nicht rechtswirksame, Grün mit einem roten Quadrat-Symbol
                für rechtswirksame Pläne mit laufenden Änderungsverfahren.
                Zusätzlich wird der Verfahrensstand auch als Text im Titelbalken
                ausgeprägt.
              </p>
              <p>
                Mit einem einfachen Klick auf eine andere B-Plan-Fläche aus der
                Treffermenge erhält der zugehörige B-Plan den Fokus. Mit einem
                weiteren Klick auf diese Fläche wird der Kartenausschnitt so
                angepasst, dass der zugehörige B-Plan vollständig und zentriert
                dargestellt wird.
              </p>
              <p>
                Alternativ k&ouml;nnen Sie die Treffermenge mit den
                Schaltfl&auml;chen <a>&gt;&gt;</a> (n&auml;chster Treffer) und
                &nbsp;
                <a>&lt;&lt;</a> (vorheriger Treffer) durchmustern. (Die
                Treffermenge ist geordnet nach zunehmendem Abstand des Plans vom
                Bezugspunkt ihrer Suche.)
              </p>
              <p>
                Mit&nbsp;
                <a>alle Treffer anzeigen</a>
                &nbsp; k&ouml;nnen Sie den Kartenausschnitt zuvor so anpassen,
                dass alle Pl&auml;ne der Treffermenge vollst&auml;ndig angezeigt
                werden.
              </p>

              <p>
                Mit der Schaltfläche <Icon name="chevron-circle-down" /> im
                dunkelgrau abgesetzten rechten Rand der Info-Box lässt sich
                diese so verkleinern, dass nur noch die B-Plan-Nummer und das
                verkleinerte PDF-Symbol zum{' '}
                <a
                  onClick={() => {
                    setAppMenuActiveMenuSection('dokuumente-betrachten');
                  }}
                >
                  Starten des Dokumentenviewers
                </a>{' '}
                angezeigt werden - nützlich für Endgeräte mit kleinem Display.
                Mit der Schaltfläche <Icon name="chevron-circle-up" /> an
                derselben Stelle können Sie die Info-Box wieder vollständig
                einblenden.
              </p>
            </div>
          }
        />,
        <Section
          key="dokuumente-betrachten"
          sectionKey="dokuumente-betrachten"
          sectionTitle="B-Plan-Dokumente betrachten"
          sectionBsStyle="info"
          sectionContent={
            <div>
              <p>
                Durch Anklicken des Links "Dokumente" in der Info-Box oder des
                PDF-Symbols direkt darüber wird in einer neuen Registerkarte
                Ihres Browsers ein Dokumentenviewer geöffnet, in dem die
                Dokumente zu demjenigen B-Plan betrachtet werden können, der
                gerade den Fokus hat. Wenn zu dem B-Plan mehrere Dokumente
                verfügbar sind, werden diese in einer Navigationsleiste am
                linken Rand des Dokumentenviewers angeboten. Klicken Sie auf
                eines der Symbole in der Navigationsleiste, um das zugehörige
                Dokument in den Anzeigebereich des Dokumentenviewers zu laden.
                Mit den Werkzeugen <Icon name="chevron-left" />{' '}
                <i>"vorherige Seite"</i> und <Icon name="chevron-right" />{' '}
                <i>"nächste Seite"</i> in der Werkzeugleiste am oberen Rand des
                Dokumentenviewers können Sie in mehrseitigen Dokumenten vor- und
                zurückblättern.
              </p>
              <p>
                Mehrere Dokumente werden angezeigt, wenn der B-Plan mehrere
                Planteile umfasst oder wenn die verfahrensbegleitenden
                Zusatzdokumente bereits in digitaler Form vorliegen. Die
                Bereitstellung dieser Dokumente ist ein laufendes Vorhaben der
                Stadtverwaltung Wuppertal, Stand 04/2020 sind sie für rund 72%
                der Wuppertaler B-Pläne verfügbar. Die Namenskonventionen für
                die vielfältigen Zusatzdateien sind im Dokument{' '}
                <a href={''} target="_info">
                  Info Dateinamen
                </a>{' '}
                beschrieben, das in der Navigationsleiste als oberstes
                Zusatzdokument angeboten wird.
              </p>
              <p>
                Im Anzeigebereich können Sie das Dokument durch Ziehen mit der
                Maus verschieben. Mit den Werkzeugen <Icon name="plus" /> und{' '}
                <Icon name="minus" /> können Sie die Darstellung vergrößern bzw.
                verkleinern. Darüber hinaus finden Sie in der Werkzeugleiste mit{' '}
                <Icon name="arrows-h" /> <i>"an Fensterbreite anpassen"</i> und{' '}
                <span style={{ whiteSpace: 'nowrap' }}>
                  <Icon name="arrows-v" /> <i>"an Fensterhöhe anpassen"</i>
                </span>{' '}
                zwei Möglichkeiten zur schnellen Optimierung der
                Dokumentdarstellung. Wenn Sie für weitere B-Pläne aus dem
                Kartenfenster zur Dokumentbetrachtung wechseln, wird eine ggf.
                bereits zuvor für den Dokumentenviewer geöffnete Registerkarte
                Ihres Browsers angesteuert.
              </p>
            </div>
          }
        />,
        <Section
          key="plandownload"
          sectionKey="plandownload"
          sectionTitle="B-Pläne herunterladen"
          sectionBsStyle="info"
          sectionContent={
            <div>
              <p>
                Das Herunterladen der Dokumente zu einem B-Plan-Verfahren
                erfolgt aus dem Dokumentenviewer. Dazu finden Sie in der
                Werkzeugleiste zwei Möglichkeiten. Mit dem immer verfügbaren
                Werkzeug <Icon name="download" />{' '}
                <i>"Dokument herunterladen (pdf)"</i> können Sie das aktuell im
                Anzeigebereich dargestellte Dokument als PDF-Datei
                herunterladen. Das zweite Werkzeug{' '}
                <Icon name="file-archive-o" />{' '}
                <i>"alles herunterladen (zip)"</i> dient zum Download eines
                zip-Archivs mit allen Planteilen und verfahrensbegleitenden
                Zusatzdokumenten einschließlich des Info-Dokuments zu den
                Namenskonventionen für die Zusatzdokumente. Es lässt sich nur
                aktivieren, wenn zu dem aktuell betrachteten B-Plan mehrere
                Dokumente verfügbar sind.
              </p>
              <p>
                Unten rechts im Anzeigebereich finden Sie stets den Dateinamen,
                unter dem das gerade dargestellte Dokument heruntergeladen wird.
                Diese Dateinamen sind etwas länger als die in der
                Navigationsleiste verwendeten Bezeichnungen, wo die für alle
                Dokumente eines B-Plans gleichen Namensbestandteile ausgeblendet
                werden.
              </p>
              <p>
                Ob eine heruntergeladene Datei nach dem Download sofort mit
                einem geeigneten Programm (PDF-Viewer oder Dateimanager)
                geöffnet wird, hängt von Ihren Betriebssystem- und/oder
                Browsereinstellungen ab.
              </p>
            </div>
          }
        />,
      ]}
      menuFooter={
        <div>
          <span style={{ fontSize: '11px' }}>
            <div>
              <strong>Hintergrundkarte</strong>: Stadtkarte 2.0 © RVR | Amtliche
              Basiskarte (ABK), B-Plan-Geltungsbereiche (
              <a
                target="ackmore"
                href="https://offenedaten-wuppertal.de/dataset/rechtsverbindliche-bebauungspl%C3%A4ne-wuppertal"
              >
                rechtswirksam{' '}
              </a>{' '}
              |{' '}
              <a
                target="ackmore"
                href="https://offenedaten-wuppertal.de/dataset/laufende-bebauungsplanverfahren-wuppertal"
              >
                laufende Verfahren
              </a>
              ) © Stadt Wuppertal |
              <a
                target="ackmore"
                href="http://www.geodatenzentrum.de/geodaten/gdz_rahmen.gdz_div?gdz_spr=deu&amp;gdz_akt_zeile=4&amp;gdz_anz_zeile=4&amp;gdz_unt_zeile=0&amp;gdz_user_id=0"
              >
                {' '}
                WebAtlasDE
              </a>{' '}
              © BKG{' '}
              <a
                onClick={() => setAppMenuActiveMenuSection('hintergrundkarte')}
              >
                (Details und Nutzungsbedingungen)
              </a>
              <div>
                <b>TopicMaps Wuppertal (Version 1.22.5)</b>:{' '}
                <a href="https://cismet.de/" target="_cismet">
                  cismet GmbH
                </a>{' '}
                auf Basis von{' '}
                <a href="http://leafletjs.com/" target="_more">
                  Leaflet
                </a>{' '}
                und{' '}
                <a href="https://cismet.de/#refs" target="_cismet">
                  cids | WuNDa
                </a>{' '}
                |{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://cismet.de/datenschutzerklaerung.html"
                >
                  Datenschutzerklärung (Privacy Policy)
                </a>
              </div>
            </div>
          </span>
        </div>
      }
    />
  );
};

export default Modal;
