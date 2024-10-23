import React, { useContext } from 'react';
import Icon from 'react-cismap/commons/Icon';
import CustomizationContextProvider from 'react-cismap/contexts/CustomizationContextProvider';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';
import ConfigurableDocBlocks from 'react-cismap/topicmaps/ConfigurableDocBlocks';
import GenericHelpTextForMyLocation from 'react-cismap/topicmaps/docBlocks/GenericHelpTextForMyLocation';
import DefaultSettingsPanel from 'react-cismap/topicmaps/menu/DefaultSettingsPanel';
import ModalApplicationMenu from 'react-cismap/topicmaps/menu/ModalApplicationMenu';
import Section from 'react-cismap/topicmaps/menu/Section';
import LicenseLuftbildkarte from 'react-cismap/topicmaps/wuppertal/LicenseLuftbildkarte';
import LicenseStadtplanTagNacht from 'react-cismap/topicmaps/wuppertal/LicenseStadtplanTagNacht';
import { Link } from 'react-scroll';
import MenuFooter from './MenuFooter';
import { getBadSVG } from './helper/helper';
import { getColorForProperties } from './helper/styler';

const Menu = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  const helpSVGSize = 18;
  const hallenBadSVG = getBadSVG(
    helpSVGSize,
    '#565B5E',
    'Hallenbad',
    'helpTextSVG0'
  );
  const freibadBadSVG = getBadSVG(
    helpSVGSize,
    '#565B5E',
    'Freibad',
    'helpTextSVG1'
  );

  const staedtischesFreibadSVG = getBadSVG(
    helpSVGSize,
    '#1A4860',
    'Freibad',
    'helpTextSVG2'
  );
  const oeffentlichesVereinsbadSVG = getBadSVG(
    helpSVGSize,
    getColorForProperties({
      more: { zugang: 'öffentlich', betreiber: 'Verein' },
      mainlocationtype: { lebenslagen: ['Freizeit', 'Sport'] },
    }),
    'Freibad',
    'helpTextSVG3'
  );
  const nichtOeffentlichesVereinsbadSVG = getBadSVG(
    helpSVGSize,
    getColorForProperties({
      more: { zugang: 'nicht öffentlich', betreiber: 'Verein' },
      mainlocationtype: { lebenslagen: ['Freizeit', 'Sport'] },
    }),
    'Freibad',
    'helpTextSVG4'
  );

  return (
    <CustomizationContextProvider customizations={{}}>
      <ModalApplicationMenu
        menuIcon={'bars'}
        menuTitle={'Einstellungen und Kompaktanleitung'}
        menuFooter={<MenuFooter />}
        menuIntroduction={
          <span>
            Über{' '}
            <Link
              className="useAClassNameToRenderProperLink"
              to="filter"
              containerId="myMenu"
              smooth={true}
              delay={100}
              onClick={() => setAppMenuActiveMenuSection('settings')}
            >
              Einstellungen
            </Link>{' '}
            können Sie die Darstellung der Hintergrundfkarte und der Bäder an
            Ihre Vorlieben anpassen. Wählen Sie{' '}
            <Link
              className="useAClassNameToRenderProperLink"
              to="settings"
              containerId="myMenu"
              smooth={true}
              delay={100}
              onClick={() => setAppMenuActiveMenuSection('help')}
            >
              Kompaktanleitung
            </Link>{' '}
            für detailliertere Bedienungsinformationen.
          </span>
        }
        menuSections={[
          <DefaultSettingsPanel key="settings" />,
          <Section
            key="help"
            sectionKey="help"
            sectionTitle="Kompaktanleitung"
            sectionBsStyle="info"
            sectionContent={
              <ConfigurableDocBlocks
                configs={[
                  {
                    type: 'FAQS',
                    configs: [
                      {
                        title: 'Datengrundlage',
                        bsStyle: 'warning',
                        contentBlockConf: {
                          type: 'REACTCOMP',
                          content: (
                            <div>
                              <p>
                                Die <strong>Bäderkarte Wuppertal</strong> bietet
                                ihnen die folgenden Hintergrundkarten an, die
                                auf verschiedenen Geodatendiensten und Geodaten
                                basieren:
                              </p>

                              <ul>
                                <LicenseStadtplanTagNacht />
                                <LicenseLuftbildkarte />
                              </ul>

                              <p>
                                Zusätzlich nutzt die Bäderkarte den Datensatz{' '}
                                <a
                                  target="_legal"
                                  href="https://offenedaten-wuppertal.de/dataset/interessante-orte-poi-wuppertal"
                                >
                                  POI Wuppertal
                                </a>{' '}
                                des{' '}
                                <a
                                  target="_legal"
                                  href="https://www.wuppertal.de/rathaus-buergerservice/karten_vermessung/index.php"
                                >
                                  Ressorts Vermessung, Katasteramt und Geodaten
                                </a>{' '}
                                aus dem Open-Data-Angebot der Stadt Wuppertal,
                                der auch die Wuppertaler Schwimmbäder umfasst.
                              </p>
                            </div>
                          ),
                        },
                      },
                      {
                        title: 'Bäder auswählen und abfragen',
                        bsStyle: 'secondary',
                        contentBlockConf: {
                          type: 'REACTCOMP',
                          content: (
                            <div>
                              {' '}
                              <p>
                                Bewegen Sie den Mauszeiger im Kartenfenster auf
                                eines der Schwimmbad-Symbole, um sich den Namen
                                des Bades anzeigen zu lassen. Ein Klick auf das
                                Symbol setzt den Fokus auf dieses Schwimmbad. Es
                                wird dann blau hinterlegt und die zugehörigen
                                Informationen (Name, Kurzinformation, Straße und
                                Hausnummer) werden unten rechts in der Info-Box
                                angezeigt. (Auf einem Tablet-PC wird der Fokus
                                durch das erste Antippen des Schwimmbad-Symbols
                                gesetzt, das zweite Antippen blendet den Namen
                                ein.) Außerdem werden Ihnen in der Info-Box
                                weiterführende (Kommunikations-) Links zu diesem
                                Schwimmbad angezeigt:{' '}
                                <Icon name="external-link-square" /> Internet,{' '}
                                <span style={{ whiteSpace: 'nowrap' }}>
                                  <Icon name="envelope-square" /> E-Mail
                                </span>{' '}
                                und <Icon name="phone" /> Telefon. Durch
                                Anklicken des Kalender-Symbols{' '}
                                <Icon name="calendar" /> gelangen Sie bei
                                einigen städtischen Bädern zum
                                Aqua-Aktiv-Kursprogramm des Sport- und
                                Bäderamtes. Dort können Sie online Fitnesskurse
                                in diesen Bädern buchen.
                              </p>
                              <p>
                                Wenn Sie noch kein Schwimmbad im aktuellen
                                Kartenausschnitt selektiert haben, wird der
                                Fokus automatisch auf das nördlichste Bad
                                gesetzt. Mit den Funktionen <a>&lt;&lt;</a>{' '}
                                vorheriger Treffer und <a>&gt;&gt;</a> nächster
                                Treffer können Sie ausgehend von dem Schwimmbad,
                                auf dem gerade der Fokus liegt, in nördlicher
                                bzw. südlicher Richtung alle aktuell im
                                Kartenfenster angezeigten Bäder durchmustern.
                              </p>
                              <p>
                                Mit der Schaltfläche{' '}
                                <Icon name="chevron-circle-down" /> im
                                dunkelgrau abgesetzten rechten Rand der Info-Box
                                lässt sich diese so verkleinern, dass nur noch
                                die thematische Zuordnung und der Name des
                                Schwimmbades sowie die Link-Symbole angezeigt
                                werden - nützlich für Endgeräte mit kleinem
                                Display. Mit der Schaltfläche{' '}
                                <Icon name="chevron-circle-up" /> an derselben
                                Stelle können Sie die Info-Box dann wieder
                                vollständig einblenden.
                              </p>
                              <p>
                                Zu einigen Schwimmbädern bieten wir Ihnen Fotos
                                oder Fotoserien an. Sie finden dann ein
                                Vorschaubild direkt über der Info-Box. Klicken
                                Sie auf das Vorschaubild, um einen
                                Bildbetrachter ("Leuchtkasten") mit dem Foto /
                                der Fotoserie zu öffnen. Wenn wir hier auf
                                Bildmaterial zugreifen, das der Urheber auch
                                selbst im Internet publiziert, finden Sie im
                                Fußbereich des Bildbetrachters einen Link auf
                                dieses Angebot.
                              </p>
                            </div>
                          ),
                        },
                      },
                      {
                        title: 'Kartendarstellung der Bäder',
                        bsStyle: 'secondary',
                        contentBlockConf: {
                          type: 'REACTCOMP',
                          content: (
                            <div>
                              {' '}
                              <p>
                                Zur Darstellung der Schwimmbäder in der Karte
                                werden unterschiedliche Symbole für Hallenbäder{' '}
                                {hallenBadSVG} und Freibäder {freibadBadSVG}{' '}
                                verwendet. Dabei werden 3 unterschiedliche
                                Hintergrundfarben verwendet:{' '}
                                {staedtischesFreibadSVG} steht für städtische
                                Bäder, die alle öffentlich zugänglich sind.{' '}
                                {oeffentlichesVereinsbadSVG} kennzeichnet
                                öffentlich zugängliche Bäder in Vereinsregie und{' '}
                                {nichtOeffentlichesVereinsbadSVG} wird für nicht
                                öffentlich zugängliche Vereinsbäder eingesetzt.
                                Diese Farben werden in der Titelzeile der
                                Info-Box aufgegriffen. Zusätzlich werden dort
                                die Informationen zusammengefasst, die für die
                                Kartendarstellung relevant sind, z. B.
                                "Hallenbad (Verein), nicht öffentlich".
                              </p>
                            </div>
                          ),
                        },
                      },
                      {
                        title: 'In Karte positionieren',
                        bsStyle: 'secondary',
                        contentBlockConf: {
                          type: 'REACTCOMP',
                          content: (
                            <div>
                              {' '}
                              <p>
                                Um die Schwimmbäder in einem bestimmten Bereich
                                des Stadtgebietes zu erkunden, geben Sie den
                                Anfang eines Stadtteils (Stadtbezirk oder
                                Quartier), einer Adresse, eines Straßennamens
                                oder eines POI im Eingabefeld links unten ein
                                (mindestens 2 Zeichen). In der inkrementellen
                                Auswahlliste werden Ihnen passende Treffer
                                angeboten. (Wenn Sie weitere Zeichen eingeben,
                                wird der Inhalt der Auswahlliste angepasst.)
                                Durch das vorangestellte Symbol erkennen Sie, ob
                                es sich dabei um einen <Icon name="circle" />{' '}
                                Stadtbezirk, ein <Icon name="pie-chart" />{' '}
                                Quartier, eine <Icon name="home" /> Adresse,
                                eine <Icon name="road" /> Straße ohne
                                zugeordnete Hausnummern, einen{' '}
                                <Icon name="tag" /> POI, die{' '}
                                <Icon name="tags" /> alternative Bezeichnung
                                eines POI, eine <Icon name="child" />{' '}
                                Kindertageseinrichtung oder eine{' '}
                                <Icon name="graduation-cap" /> Schule handelt.
                              </p>
                              <p>
                                Nach der Auswahl eines Treffers aus der Liste
                                wird die Karte auf die zugehörige Position
                                zentriert. Bei Suchbegriffen mit Punktgeometrie
                                (Adresse, Straße, POI) wird außerdem ein großer
                                Maßstab (Zoomstufe 14) eingestellt und ein
                                Marker{' '}
                                <img
                                  alt="Cluster"
                                  src="images/AdressMarker.jpg"
                                />{' '}
                                auf der Zielposition platziert. Bei
                                Suchbegriffen mit Flächengeometrie (Stadtbezirk,
                                Quartier) wird der Maßstab so eingestellt, dass
                                die Fläche vollständig dargestellt werden kann.
                                Zusätzlich wird der Bereich außerhalb dieser
                                Fläche abgedunkelt (Spotlight-Effekt).
                              </p>
                              <p>
                                Durch Anklicken des Werkzeugs{' '}
                                <Icon name="times" /> links neben dem
                                Eingabefeld können Sie die Suche zurücksetzen
                                (Entfernung von Marker bzw. Abdunklung, Löschen
                                des Textes im Eingabefeld).
                              </p>
                              <p>
                                Da die Wuppertaler Schwimmbäder vollständig im
                                POI-Datensatz enthalten sind, können Sie sich
                                über alle gängigen Bezeichnungen dieser
                                Schwimmbäder in der Karte positionieren. Dabei
                                sind auch die Namen der Vereine, die ein
                                Schwimmbad betreiben, als alternative
                                Bezeichnungen des jeweiligen Bades hinterlegt.
                                (Geben Sie z. B. einmal "Wasserfreunde" ein.)
                              </p>
                            </div>
                          ),
                        },
                      },
                      {
                        title: 'Mein Standort',
                        bsStyle: 'secondary',
                        contentBlockConf: {
                          type: 'REACTCOMP',
                          content: (
                            <div>
                              <GenericHelpTextForMyLocation />
                            </div>
                          ),
                        },
                      },
                      {
                        title: 'Einstellungen',
                        bsStyle: 'success',
                        contentBlockConf: {
                          type: 'REACTCOMP',
                          content: (
                            <div>
                              <p>
                                Unter "<strong>Einstellungen</strong>" können
                                Sie im Anwendungsmenü <Icon name="bars" />{' '}
                                festlegen, wie die POI und die Hintergrundkarte
                                angezeigt werden sollen. Zu den POI können Sie
                                auswählen, ob Ihre unter "
                                <strong>Mein Themenstadtplan</strong>"
                                festgelegte Lebenslagen-Filterung in einer
                                Titelzeile ausgeprägt wird oder nicht. Weiter
                                können Sie festlegen, ob räumlich nah
                                beieinander liegende POI maßstabsabhängig zu
                                einem Punktsymbol zusammengefasst werden oder
                                nicht. Unter "
                                <em>
                                  <strong>Symbolgröße</strong>
                                </em>
                                " können Sie in Abhängigkeit von Ihrer
                                Bildschirmauflösung und Ihrem Sehvermögen
                                auswählen, ob die POI mit kleinen (25 Pixel),
                                mittleren (35 Pixel) oder großen (45 Pixel)
                                Symbolen angezeigt werden.
                              </p>
                              <p>
                                Unter "
                                <em>
                                  <strong>Hintergrundkarte</strong>
                                </em>
                                " können Sie auswählen, ob Sie die standardmäßig
                                aktivierte farbige Hintergrundkarte verwenden
                                möchten ("<em>Stadtplan (Tag)</em>") oder lieber
                                eine invertierte Graustufenkarte ("
                                <em>Stadtplan (Nacht)</em>
                                "), zu der uns die von vielen PKW-Navis bei
                                Dunkelheit eingesetzte Darstellungsweise
                                inspiriert hat. <strong>Hinweis:</strong> Der
                                Stadtplan (Nacht) wird Ihnen nur angeboten, wenn
                                Ihr Browser CSS3-Filtereffekte unterstützt, also
                                z. B. nicht beim Microsoft Internet Explorer.
                                Die Nacht-Karte erzeugt einen deutlicheren
                                Kontrast mit den farbigen POI-Symbolen, die
                                unterschiedlichen Flächennutzungen in der
                                Hintergrundkarte lassen sich aber nicht mehr so
                                gut unterscheiden wie in der Tag-Karte. Als
                                dritte Möglichkeit steht eine Luftbildkarte zur
                                Verfügung, die die Anschaulichkeit des
                                Luftbildes mit der Eindeutigkeit des Stadtplans
                                (Kartenschrift, durchscheinende Linien)
                                verbindet.{' '}
                              </p>
                              <p>
                                Im Vorschaubild sehen Sie direkt die
                                prinzipielle Wirkung ihrer Einstellungen.
                              </p>
                            </div>
                          ),
                        },
                      },
                      {
                        title: 'Personalisierung',
                        bsStyle: 'success',
                        contentBlockConf: {
                          type: 'REACTCOMP',
                          content: (
                            <p>
                              Ihre Themenauswahl und Einstellungen bleiben auch
                              nach einem Neustart der Anwendung erhalten. (Es
                              sei denn, Sie löschen den Browser-Verlauf
                              einschließlich der gehosteten App-Daten.) Damit
                              können Sie mit wenigen Klicks aus unserem
                              Online-Stadtplan einen dauerhaft für Sie
                              optimierten Themenstadtplan machen.
                            </p>
                          ),
                        },
                      },
                    ],
                  },
                ]}
              />
            }
          />,
        ]}
      />
    </CustomizationContextProvider>
  );
};
export default Menu;
const NW = (props) => {
  return <span style={{ whiteSpace: 'nowrap' }}>{props.children}</span>;
};
