import React, { useContext, useMemo } from 'react';
import Icon from 'react-cismap/commons/Icon';
import CustomizationContextProvider from 'react-cismap/contexts/CustomizationContextProvider';
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from 'react-cismap/contexts/FeatureCollectionContextProvider';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';
import ConfigurableDocBlocks from 'react-cismap/topicmaps/ConfigurableDocBlocks';
import GenericHelpTextForMyLocation from 'react-cismap/topicmaps/docBlocks/GenericHelpTextForMyLocation';
import ModalApplicationMenu from 'react-cismap/topicmaps/menu/ModalApplicationMenu';
import Section from 'react-cismap/topicmaps/menu/Section';
import LicenseLuftbildkarte from 'react-cismap/topicmaps/wuppertal/LicenseLuftbildkarte';
import LicenseStadtplanTagNacht from 'react-cismap/topicmaps/wuppertal/LicenseStadtplanTagNacht';
import { Link } from 'react-scroll';

import FilterUI from './FilterUI';
import MenuFooter from './MenuFooter';
import FilterRowUI from './FilterRowUI';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faAt,
  faCopy,
  faMagnifyingGlass,
  faMap,
  faPrint,
  faShareFromSquare,
  faSquareMinus,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
// import { Tooltip } from 'antd';
import { TopicMapDispatchContext } from 'react-cismap/contexts/TopicMapContextProvider';
import {
  Button,
  ButtonGroup,
  Dropdown,
  Alert,
  Tooltip,
  OverlayTrigger,
} from 'react-bootstrap';

const Menu = ({ bookmarks, setBookmarks }) => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  const { filteredItems, shownFeatures, itemsDictionary, allFeatures } =
    useContext(FeatureCollectionContext);
  const { zoomToFeature } = useContext(TopicMapDispatchContext);

  const globalbereiche = useMemo(
    () => itemsDictionary?.globalbereiche || [],
    [itemsDictionary]
  );

  const kenntnisse = useMemo(
    () => itemsDictionary?.kenntnisse || [],
    [itemsDictionary]
  );

  const zielgruppen = useMemo(
    () => itemsDictionary?.zielgruppen || [],
    [itemsDictionary]
  );

  const getFilterHeader = () => {
    const count = filteredItems?.length || 0;

    let term;
    if (count === 1) {
      term = 'Angebot';
    } else {
      term = 'Angebote';
    }

    return `Filtern (${count} ${term} gefunden, davon ${
      shownFeatures?.length || '0'
    } in der Karte)`;
  };

  return (
    <CustomizationContextProvider customizations={{}}>
      <ModalApplicationMenu
        menuIcon={'bars'}
        menuTitle={'Filter, Merkliste und Kompaktanleitung'}
        menuFooter={<MenuFooter />}
        menuIntroduction={
          <span>
            W&auml;hlen Sie Ihre Such- und Ausschlussbedingungen in den{' '}
            <Link
              className="useAClassNameToRenderProperLink"
              to="filter"
              containerId="myMenu"
              smooth={true}
              delay={100}
              onClick={() => setAppMenuActiveMenuSection('filter')}
            >
              Filtern
            </Link>{' '}
            aus, um die angezeigten Angebote an Ihre Interessen anzupassen
            (alternativ über die Einstellungen unter den darunter folgenden
            Leitfragen). Über{' '}
            <Link
              className="useAClassNameToRenderProperLink"
              to="settings"
              containerId="myMenu"
              smooth={true}
              delay={100}
              onClick={() => setAppMenuActiveMenuSection('merkliste')}
            >
              meine Merkliste
            </Link>{' '}
            erreichen Sie die Liste der Angebote, die Sie festgehalten haben.
            Wählen Sie{' '}
            <Link
              className="useAClassNameToRenderProperLink"
              to="help"
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
          <Section
            key="filter"
            sectionKey="filter"
            sectionTitle={getFilterHeader()}
            sectionBsStyle="primary"
            sectionContent={<FilterUI />}
          />,
          <Section
            key="glb"
            sectionKey="glb"
            sectionTitle="Welches Ausgabenfeld interessiert mich?"
            sectionBsStyle="warning"
            sectionContent={
              <table border={0}>
                <tbody>
                  <FilterRowUI items={globalbereiche} />
                </tbody>
              </table>
            }
          />,
          <Section
            key="ken"
            sectionKey="ken"
            sectionTitle="Was will ich tun?"
            sectionBsStyle="info"
            sectionContent={
              <table border={0}>
                <tbody>
                  <FilterRowUI items={kenntnisse} />
                </tbody>
              </table>
            }
          />,
          <Section
            key="zg"
            sectionKey="zg"
            sectionTitle="Mit wem möchte ich arbeiten?"
            sectionBsStyle="success"
            sectionContent={
              <table border={0}>
                <tbody>
                  <FilterRowUI items={zielgruppen} />
                </tbody>
              </table>
            }
          />,
          <Section
            key="merkliste"
            sectionKey="merkliste"
            sectionTitle={`meine Merkliste ${'(' + bookmarks.length + ')'}`}
            sectionBsStyle="primary"
            sectionContent={
              <>
                <table width="100%" border={0}>
                  <tbody>
                    <tr>
                      <td>
                        <ul>
                          {bookmarks.map((value) => {
                            const feature = allFeatures.find(
                              (obj) => obj.properties.id === value
                            );
                            const text = feature.text;
                            const id = feature.properties.id;
                            return (
                              <li key={'cart.li.' + id}>
                                <h5>
                                  Angebot Nr. {id}{' '}
                                  <OverlayTrigger
                                    placement="top"
                                    overlay={
                                      <Tooltip style={{ zIndex: 30000000000 }}>
                                        In Karte anzeigen
                                      </Tooltip>
                                    }
                                  >
                                    <FontAwesomeIcon
                                      icon={faMagnifyingGlass}
                                      onClick={() => {
                                        zoomToFeature(feature);
                                      }}
                                      style={{
                                        height: 13,
                                        paddingLeft: '12px',
                                        paddingRight: '16px',
                                        cursor: 'pointer',
                                      }}
                                    />
                                  </OverlayTrigger>
                                  <OverlayTrigger
                                    placement="top"
                                    overlay={
                                      <Tooltip style={{ zIndex: 30000000000 }}>
                                        Aus Merkliste entfernen
                                      </Tooltip>
                                    }
                                  >
                                    <FontAwesomeIcon
                                      icon={faSquareMinus}
                                      onClick={() => {
                                        setBookmarks((prev) =>
                                          prev.filter(
                                            (id) => id !== feature.properties.id
                                          )
                                        );
                                      }}
                                      style={{
                                        height: 14,
                                        color: '#C33D17',
                                        cursor: 'pointer',
                                      }}
                                    />
                                  </OverlayTrigger>
                                </h5>
                                <h6>{text}</h6>
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                      <td style={{ textAlign: 'right', verticalAlign: 'top' }}>
                        <ButtonGroup bsStyle="default">
                          <OverlayTrigger
                            placement="top"
                            overlay={
                              <Tooltip style={{ zIndex: 30000000000 }}>
                                Merkliste löschen
                              </Tooltip>
                            }
                          >
                            <Button
                              variant="light"
                              onClick={() => setBookmarks([])}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </Button>
                          </OverlayTrigger>
                          <OverlayTrigger
                            placement="top"
                            overlay={
                              <Tooltip style={{ zIndex: 30000000000 }}>
                                Merklistenfilter aktivieren
                              </Tooltip>
                            }
                          >
                            <Button variant="light">
                              <FontAwesomeIcon icon={faMap} />
                            </Button>
                          </OverlayTrigger>
                          <Dropdown>
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip style={{ zIndex: 30000000000 }}>
                                  Merkliste teilen
                                </Tooltip>
                              }
                            >
                              <Dropdown.Toggle variant="light">
                                <FontAwesomeIcon icon={faShareFromSquare} />
                              </Dropdown.Toggle>
                            </OverlayTrigger>
                            <Dropdown.Menu>
                              <Dropdown.Item
                                eventKey="1"
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    window.location.href
                                  );
                                }}
                              >
                                <FontAwesomeIcon icon={faCopy} /> Link kopieren
                              </Dropdown.Item>
                              <Dropdown.Item eventKey="2">
                                <FontAwesomeIcon icon={faAt} /> Merkliste per
                                Mail senden
                              </Dropdown.Item>
                              <Dropdown.Item eventKey="3" disabled={true}>
                                <FontAwesomeIcon icon={faPrint} /> Merkliste
                                drucken
                              </Dropdown.Item>
                            </Dropdown.Menu>
                          </Dropdown>
                        </ButtonGroup>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <Alert variant="warning" style={{ marginTop: '4px' }}>
                  <div>
                    Haben Sie interessante Angebote gefunden? Dann treten Sie
                    mit uns in Kontakt (Telefon +49-(0)202-946-20445 oder E-Mail{' '}
                    <a href="mailto:post@zfgt.de">post@zfgt.de</a>
                    ). Wir werden Sie bei den weiteren Schritten beraten.
                  </div>
                </Alert>
              </>
            }
          />,
          <Section
            key="help"
            sectionKey="help"
            sectionTitle="Kompaktanleitung"
            sectionBsStyle="default"
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
                                Der <strong>Online-Stadtplan Wuppertal</strong>{' '}
                                bietet ihnen die folgenden Hintergrundkarten an,
                                die auf verschiedenen Geodatendiensten und
                                Geodaten basieren:
                              </p>

                              <ul>
                                <LicenseStadtplanTagNacht />
                                <LicenseLuftbildkarte />
                              </ul>

                              <p>
                                Zusätzlich nutzt der Online-Stadtplan für die
                                Themendarstellung den Datensatz{' '}
                                <a
                                  target="_legal"
                                  href="https://offenedaten-wuppertal.de/dataset/interessante-orte-poi-wuppertal"
                                >
                                  Interessante Orte Wuppertal (POI)
                                </a>
                                ,{' '}
                                <a
                                  target="_legal"
                                  href="https://offenedaten-wuppertal.de/dataset/kindertageseinrichtungen-wuppertal"
                                >
                                  Kindertageseinrichtungen Wuppertal
                                </a>{' '}
                                und{' '}
                                <a
                                  target="_legal"
                                  href="https://offenedaten-wuppertal.de/dataset/schulen-wuppertal"
                                >
                                  Schulen Wuppertal
                                </a>{' '}
                                aus dem Open-Data-Angebot der Stadt Wuppertal.
                              </p>
                            </div>
                          ),
                        },
                      },
                      {
                        title: 'Kartendarstellung der POI',
                        bsStyle: 'warning',
                        contentBlockConf: {
                          type: 'REACTCOMP',
                          content: (
                            <div>
                              {' '}
                              <p>
                                Jeder POI (Point of Interest, 'Interessanter
                                Ort') ist einem oder mehreren übergeordneten
                                Themenfeldern wie z. B. "<em>Freizeit</em>" oder
                                "<em>Erholung</em>" zugeordnet. Die
                                Hintergrundfarben der POI-Symbole stehen jeweils
                                für eine eindeutige Kombination dieser
                                Themenfelder, z. B. Hellgrün für "
                                <em>Freizeit, Erholung</em>
                                ".
                              </p>
                              <p>
                                Räumlich nah beieinander liegende POI werden
                                standardmäßig maßstabsabhängig zu größeren
                                Punkten zusammengefasst, mit der Anzahl der
                                repräsentierten POI im Zentrum{' '}
                                <img
                                  alt="Cluster"
                                  src="images/poi_zusammen.png"
                                />
                                . Vergrößern Sie ein paar Mal durch direktes
                                Anklicken eines solchen Punktes oder mit{' '}
                                <Icon name="plus" /> die Darstellung, so werden
                                die zusammengefassten POI Schritt für Schritt in
                                die kleineren Symbole für die konkreten
                                Einzel-POI zerlegt. Ab einer bestimmten
                                Maßstabsstufe (Zoomstufe 12) führt ein weiterer
                                Klick dazu, dass eine Explosionsgraphik der
                                zusammengefassten POI angezeigt wird.
                              </p>
                            </div>
                          ),
                        },
                      },
                      {
                        title: 'POI auswählen und abfragen',
                        bsStyle: 'secondary',
                        contentBlockConf: {
                          type: 'REACTCOMP',
                          content: (
                            <div>
                              {' '}
                              <p>
                                Bewegen Sie den Mauszeiger im Kartenfenster auf
                                einen konkreten Einzel-POI, um sich seine
                                Bezeichnung anzeigen zu lassen. Ein Klick auf
                                das zugehörige POI-Symbol setzt den Fokus auf
                                diesen POI. Er wird dann blau hinterlegt und die
                                zugehörigen Informationen (Bezeichnung,
                                Info-Text und ggf. Adresse) werden in der
                                Info-Box (unten rechts) angezeigt. (Auf einem
                                Tablet-PC wird der Fokus durch das erste
                                Antippen des Angebots gesetzt, das zweite
                                Antippen blendet die Bezeichnung ein.) Außerdem
                                werden Ihnen in der Info-Box weiterführende
                                (Kommunikations-) Links zum POI angezeigt:{' '}
                                <Icon name="external-link-square" /> Internet,{' '}
                                <Icon name="envelope-square" /> E-Mail und{' '}
                                <Icon name="phone" /> Telefon. Bei POI, zu denen
                                im Terminkalender von{' '}
                                <a href="https://wuppertal-live.de">
                                  www.wuppertal-live.de
                                </a>{' '}
                                Veranstaltungen geführt werden, finden sie
                                zusätzlich noch eine <Icon name="calendar" />{' '}
                                Verknüpfung zu wuppertal-live.de, wo sie für
                                viele Veranstaltungen auch Online-Tickets
                                erwerben können.
                              </p>
                              <p>
                                Wenn Sie noch nicht aktiv einen bestimmten POI
                                im aktuellen Kartenausschnitt selektiert haben,
                                wird der Fokus automatisch auf den nördlichsten
                                POI gesetzt. Mit den Funktionen <a>&lt;&lt;</a>{' '}
                                vorheriger Treffer und <a>&gt;&gt;</a> nächster
                                Treffer können Sie in nördlicher bzw. südlicher
                                Richtung alle aktuell im Kartenfenster
                                angezeigten POI durchmustern.
                              </p>
                              <p>
                                Mit der Schaltfläche{' '}
                                <Icon name="chevron-circle-down" /> im
                                dunkelgrau abgesetzten rechten Rand der Info-Box
                                lässt sich diese so verkleinern, dass nur noch
                                die thematische Zuordnung und die Bezeichnung
                                des POI sowie die Link-Symbole angezeigt werden
                                - nützlich für Endgeräte mit kleinem Display.
                                Mit der Schaltfläche{' '}
                                <Icon name="chevron-circle-up" /> an derselben
                                Stelle können Sie die Info-Box dann wieder
                                vollständig einblenden.
                              </p>
                              <p>
                                Zu einigen POI bieten wir Ihnen Fotos oder
                                Fotoserien des bekannten Wuppertaler Fotographen
                                Peter Krämer an. Sie finden dann ein
                                Vorschaubild direkt über der Info-Box. Klicken
                                Sie auf das Vorschaubild, um einen
                                Bildbetrachter ("Leuchtkasten") mit dem
                                Foto&nbsp;/&nbsp;der Fotoserie zu öffnen. Aus
                                dem Bildbetrachter gelangen Sie über einen Link
                                im Fußbereich auch zur Foto-Anwendung von Peter
                                Krämer.
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
                                Um eine bestimmte Stelle des Stadtgebietes zu
                                erkunden, geben Sie den Anfang eines Stadtteils
                                (Stadtbezirk oder Quartier), einer Adresse,
                                eines Straßennamens oder eines POI im
                                Eingabefeld links unten ein (mindestens 2
                                Zeichen). In der inkrementellen Auswahlliste
                                werden Ihnen passende Treffer angeboten. (Wenn
                                Sie weitere Zeichen eingeben, wird der Inhalt
                                der Auswahlliste angepasst.) Durch das
                                vorangestellte Symbol erkennen Sie, ob es sich
                                dabei um einen <Icon name="circle" />{' '}
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
                        title: 'Mein Themenstadtplan',
                        bsStyle: 'primary',
                        contentBlockConf: {
                          type: 'REACTCOMP',
                          content: (
                            <div>
                              {' '}
                              <p>
                                Unter "<strong>Mein Themenstadtplan</strong>"
                                können Sie im Anwendungsmenü{' '}
                                <Icon name="bars" /> auswählen, welche
                                POI-Kategorien in der Karte dargestellt werden.
                                Über die Schaltfläche{' '}
                                <img
                                  alt="Cluster"
                                  src="images/sf_keinethemenausw.png"
                                />{' '}
                                können Sie die POI vollständig ausblenden - auch
                                die Info-Box wird dann nicht mehr angezeigt.
                              </p>
                              <p>
                                Zur Filterung der POI-Kategorien bieten wir
                                Ihnen die oben beschriebenen Themenfelder an.
                                Wählen Sie z. B. mit <Icon name="thumbs-up" />{' '}
                                ausschließlich das Thema "<em>Kultur</em>" aus.
                                Als Vorschau wird Ihnen ein Donut-Diagramm
                                angezeigt, das die Anzahl der zugehörigen POI
                                und deren Verteilung auf die
                                Themen-Kombinationen (hier "
                                <em>Kultur, Gesellschaft</em>" und "
                                <em>Kultur, Freizeit</em>
                                ") anzeigt. Bewegen Sie dazu den Mauszeiger auf
                                eines der farbigen Segmente des Donut-Diagramms.
                                (Bei einem Gerät mit Touchscreen tippen Sie auf
                                eines der farbigen Segmente.)
                              </p>
                              <p>
                                Mit <Icon name="thumbs-down" /> können Sie die
                                POI, die dem entsprechenden Thema zugeordnet
                                sind, ausblenden und dadurch die Treffermenge
                                reduzieren. Schließen Sie jetzt z. B. das Thema
                                "<em>Gesellschaft</em>" aus. Im Donut-Diagramm
                                werden Ihnen dann nur noch die POI mit der
                                Themen-Kombination "<em>Kultur, Freizeit</em>"
                                angezeigt (Theater, Museen etc.). Die POI mit
                                der Kombination "<em>Kultur, Gesellschaft</em>"
                                (Standorte von Verlagen und anderen
                                Medienunternehmungen) wurden dagegen entfernt.
                              </p>
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
