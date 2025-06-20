import {
  faBicycle,
  faChargingStation,
  faEnvelope,
  faPhone,
  faPhoneFlip,
  faQuestion,
  faSquareArrowUpRight,
  faSquareEnvelope,
  faCalendarDays,
  faUserTimes,
  faCalendarTimes,
  faLocation,
  faLocationDot,
  faMapLocation,
  faMapLocationDot,
  faTag,
  faCalendarPlus,
  faMagnifyingGlass,
  faCalendarMinus,
  faClockRotateLeft,
  faMagnifyingGlassLocation,
  faBullseye,
} from "@fortawesome/free-solid-svg-icons";
import { Tag } from "antd";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import { Button, Modal, Accordion, Card, Table } from "react-bootstrap";
import { SecondaryInfoFooter } from "@carma-collab/wuppertal/e-bikes";
import versionData from "../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { changeUnreadableColor, formatIsoString } from "../../helper/styler";
import { MenuFooter } from "@carma-collab/wuppertal/commons";
import { shortenText } from "../../helper/convertItemToFeature";

const styles = {
  container: {
    padding: "10px 10px 0 10px",
    paddingTop: "0px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  row: {
    display: "flex",
    gap: "8px",
    alignItems: "baseline",
    // justifyContent: "space-between",
  },
  label: {
    fontSize: "14px",
    fontWeight: "bold",
  },
  value: {
    fontSize: "14px",
  },
  focusRoomContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  focusRoomValues: {
    paddingLeft: "8px",
    fontSize: "14px",
  },
} as const;

const SecondaryInfoModal = ({ feature, setOpen }) => {
  const close = () => {
    setOpen(false);
  };

  const plan = feature.properties;
  const district = plan?.kst_stadtbezirk?.name || "stadtweites Vorhaben";
  const street = plan?.adresse?.strasse || "some street name";
  const locationDescription = plan?.ortsbeschreibung || "ortsbeschreibung";
  const focusRoom = plan?.stek || ["Wuppertal – urbane Lebensader"];
  const resolutions = plan?.beschluesse
    ? [...plan.beschluesse]
    : [
        {
          datum: "2022-08-10",
          anzeige: "RIS",
          url: "https://ris.wuppertal.de/vo0050.asp?__kvonr=27655",
        },
      ];
  const documents = plan?.dokumente
    ? [...plan.dokumente]
    : [{ url: "Test.docx", anzeige: "Test" }];
  const docsPrefix = "/dokumente/";
  const sortedResolutions = resolutions.sort((a, b) =>
    b.datum.localeCompare(a.datum)
  );
  const completion = plan?.ende_quartal || "completion Quartal";
  const email = plan?.kontakt?.mail || "buergerbeteiligungstadt.wuppertal.de";
  const phone = plan?.kontakt?.telefon || null;
  const photos = plan?.fotos || null;
  const citizenText = plan?.bb_text || "some citizen text text ";
  const citizenUrl = plan?.bb_url || "/";

  return (
    <Modal
      style={{
        zIndex: 2900000000,
      }}
      height="100%"
      size="lg"
      show={true}
      onHide={close}
      keyboard={false}
    >
      <Modal.Header>
        <Modal.Title>
          {/* <FontAwesomeIcon icon={faSquareEnvelope} /> */}
          {` Datenblatt: `}
          <span
            style={{
              color: plan.abgeschlossen
                ? changeUnreadableColor(plan.color)
                : "inherit",
            }}
          >
            {plan.info.title}
          </span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body id="myMenu" key={"prbr.secondaryInfo"}>
        <div style={{ width: "100%", minHeight: 250 }}>
          <div style={styles.container}>
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faClockRotateLeft} />
              <b>Letzte Aktualisierung:</b>
              <span style={styles.value}>
                {formatIsoString(plan.letzte_aktualisierung)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faMapLocation} />
              <b style={styles.label}>Stadtbezirk:</b>
              <span style={styles.value}>{district}</span>
            </div>
            {street && (
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faLocationDot} />
                <span style={styles.label}>Adresse:</span>
                <span style={styles.value}>
                  {street}{" "}
                  {plan?.adresse?.hausnummer ? plan?.adresse?.hausnummer : ""}
                </span>
              </div>
            )}
            {locationDescription && (
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faMagnifyingGlassLocation} />

                <b style={styles.label}>Ortsbeschreibung:</b>
                <span style={styles.value}>{locationDescription}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faTag} />
              <b style={styles.label}>Thema:</b>
              <span style={styles.value}>{plan.thema.name}</span>
            </div>
            {focusRoom.length > 0 && (
              <div>
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faBullseye} />

                  <b style={styles.label}>Fokusraum STEK:</b>
                  <div style={styles.focusRoomValues}>
                    {focusRoom.map((i, idx) => (
                      <Tag key={idx}>{i}</Tag>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {completion && (
              <div style={styles.row}>
                <FontAwesomeIcon icon={faCalendarMinus} />

                <b style={styles.label}>Voraussichtlicher Abschluss:</b>
                <span style={styles.value}>
                  {completion}{" "}
                  {plan?.ende_jahr ? `Quartal ${plan?.ende_jahr}` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="px-[10px]">
          <div className="py-[10px]">
            <b className="text-[16px]">Beschreibung: </b>
            <div className="mt-1">
              <span>{shortenText(plan.beschreibung, false)} </span>
              <a href="/" target="_blank">
                Mehr Informationen…
              </a>
            </div>
          </div>

          {photos && (
            <div className="py-[10px]">
              <b className="text-[16px]">Foto-Galerie:</b>
              <div className="flex gap-2 mt-3">
                {photos.map((photo, idx) => (
                  <div key={idx} className="flex gap-2">
                    <img
                      src={
                        "https://wunda-geoportal-docs.cismet.de/vorhabenkarte/fotos/" +
                        photo.url
                      }
                      alt={photo.anzeige}
                      style={{
                        width: 180,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <br />
          <Accordion style={{ marginBottom: 6 }} defaultActiveKey={"0"}>
            <Card style={{ backgroundColor: "#bce8f1" }}>
              <Card.Header>
                <Accordion.Toggle as={Button} variant="link" eventKey="0">
                  Politische Beschlüsse
                </Accordion.Toggle>
              </Card.Header>
              <Accordion.Collapse eventKey="0">
                <Card.Body style={{ backgroundColor: "white" }}>
                  <div>
                    {sortedResolutions.map((res, idx) => {
                      return (
                        <p key={idx}>
                          <a href={res.url} target="_blank">
                            {res.anzeige}
                          </a>
                        </p>
                      );
                    })}
                  </div>
                </Card.Body>
              </Accordion.Collapse>
            </Card>
          </Accordion>
          {citizenText && citizenUrl && (
            <Accordion style={{ marginBottom: 6 }} defaultActiveKey={"0"}>
              <Card style={{ backgroundColor: "#bce8f1" }}>
                <Card.Header>
                  <Accordion.Toggle as={Button} variant="link" eventKey="0">
                    Bürger­beteiligung
                  </Accordion.Toggle>
                </Card.Header>
                <Accordion.Collapse eventKey="0">
                  <Card.Body style={{ backgroundColor: "white" }}>
                    <a href={citizenUrl}>{citizenText}</a>
                  </Card.Body>
                </Accordion.Collapse>
              </Card>
            </Accordion>
          )}
          <Accordion style={{ marginBottom: 6 }} defaultActiveKey={"1"}>
            <Card style={{ backgroundColor: "#fff3cd" }}>
              <Card.Header>
                <Accordion.Toggle as={Button} variant="link" eventKey="1">
                  Anhang
                </Accordion.Toggle>
              </Card.Header>
              <Accordion.Collapse eventKey="1">
                <Card.Body style={{ backgroundColor: "white" }}>
                  <ul>
                    {documents.map((res, idx) => {
                      return (
                        <li key={idx}>
                          <a href={res.url + docsPrefix} target="_blank">
                            {res?.anzeige ? res?.anzeige : res.url}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </Card.Body>
              </Accordion.Collapse>
            </Card>
          </Accordion>
          <Accordion style={{ marginBottom: 6 }} defaultActiveKey="2">
            <Card style={{ backgroundColor: "#d6e9c6" }}>
              <Card.Header>
                <Accordion.Toggle as={Button} variant="link" eventKey="2">
                  Kontakt
                </Accordion.Toggle>
              </Card.Header>
              <Accordion.Collapse eventKey="2">
                <Card.Body style={{ backgroundColor: "white" }}>
                  <div className="flex flex-col gap-4">
                    {phone && (
                      <a
                        href={`tel:${phone}`}
                        className="flex items-center gap-2 text-inherit"
                      >
                        <FontAwesomeIcon icon={faPhone} /> {phone}
                      </a>
                    )}
                    {email && (
                      <a
                        href={`mailto:${email}`}
                        className="flex items-center gap-2 text-inherit"
                      >
                        <FontAwesomeIcon icon={faEnvelope} />{" "}
                        <span>{email}</span>
                      </a>
                    )}
                  </div>
                </Card.Body>
              </Accordion.Collapse>
            </Card>
          </Accordion>
        </div>
      </Modal.Body>
      <Modal.Footer>
        {/* <SecondaryInfoFooter
          close={close}
          version={getApplicationVersion(versionData)}
        /> */}
        <div className="flex gap-3">
          <MenuFooter
            title="Vorhabenkarte Wuppertal"
            version={"0.0.1"}
            skipHintergrundkarten={true}
          />
          <Button className="self-center" onClick={close}>
            Ok
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
};

export default SecondaryInfoModal;
