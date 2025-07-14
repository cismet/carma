import {
  faEnvelope,
  faPhone,
  faLocationDot,
  faMapLocation,
  faTag,
  faCalendarMinus,
  faClockRotateLeft,
  faMagnifyingGlassLocation,
  faBullseye,
} from "@fortawesome/free-solid-svg-icons";
import { Tag } from "antd";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Modal, Accordion } from "react-bootstrap";
import {
  changeUnreadableColor,
  formatDatum,
  formatIsoString,
} from "../../helper/styler";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";
import { useContext } from "react";
import Panel from "react-cismap/commons/Panel";
import { assetsBaseUrl } from "../../constants/constants";
import PhotoGallery from "./PhotoGallery";
import { SecondaryInfoFooter } from "@carma-collab/wuppertal/vorhabenkarte";
import Contacts from "./Contacts";

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
  },
  label: {
    fontSize: "14px",
    fontWeight: "bold",
  },
  value: {
    fontSize: "14px",
    whiteSpace: "pre-line",
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

export type LightboxDispatch = {
  setPhotoUrls: (urls: string[]) => void;
  setIndex: (i: number) => void;
  setTitle: (t: string) => void;
  setCaptions: (t: string[]) => void;
  setVisible: (v: boolean) => void;
};

const SecondaryInfoModal = ({ feature, setOpen, versionString }) => {
  const lightBoxDispatchContext = useContext(
    LightBoxDispatchContext
  ) as LightboxDispatch;

  const close = () => {
    setOpen(false);
  };

  const plan = feature.properties;
  const districtNames =
    plan?.stadtbezirke && plan?.stadtbezirke.length > 0
      ? plan?.stadtbezirke.map((s) => s.replace(/^\d+\s*-\s*/, "")).join(", ")
      : [];

  const district = "Stadtbezirk:";
  const street = plan?.adresse?.strasse || null;
  const locationDescription = plan?.ortsbeschreibung || null;
  const focusRoom = plan?.stek || [];
  const focusRoomLink =
    "https://www.wuppertal.de/wirtschaft-stadtentwicklung/stadtentwicklung/stadtentwicklungskonzept.php";
  const resolutions = plan?.beschluesse ? [...plan.beschluesse] : [];
  const documents = plan?.dokumente ? [...plan.dokumente] : [];
  const docsPrefix = "/dokumente/";
  const sortedResolutions = resolutions.sort((a, b) =>
    b.datum.localeCompare(a.datum)
  );
  const completion = plan?.ende_quartal || null;
  const email = plan?.kontakt?.mail || null;
  const phone = plan?.kontakt?.telefon || null;
  const photos = plan?.originalPhotos || null;
  const citizenText = plan?.bb_text || null;
  const citizenUrl = plan?.bb_url || null;

  const handleImgClick = (idx) => {
    lightBoxDispatchContext.setIndex(idx);
    lightBoxDispatchContext.setTitle(plan.info.title);
    lightBoxDispatchContext.setVisible(true);
  };

  return (
    <div className="secondary-modal-wrapper">
      <Modal
        style={{
          zIndex: 999,
        }}
        height="100%"
        size="lg"
        show={true}
        onHide={close}
        keyboard={false}
        dialogClassName="modal-dialog-scrollable"
      >
        <Modal.Header>
          <Modal.Title>
            {` Datenblatt: `}
            <span
              style={{
                color: plan.abgeschlossen
                  ? changeUnreadableColor(plan.color)
                  : "inherit",
              }}
            >
              {plan.info.title} {plan.abgeschlossen ? "(abgeschlossen)" : ""}
            </span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body id="myMenu" key={"prbr.secondaryInfo"}>
          <div style={{ width: "100%", marginBottom: "20px" }}>
            <div style={styles.container}>
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faClockRotateLeft} />
                <b>Letzte Aktualisierung:</b>
                <span style={styles.value}>
                  {formatIsoString(plan.letzte_aktualisierung)}
                </span>
              </div>
              {!plan.stadtweit && districtNames.length > 0 && (
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faMapLocation} />
                  <b style={styles.label}>{district}</b>
                  {districtNames.length > 0 && (
                    <span style={styles.value}>{districtNames}</span>
                  )}
                </div>
              )}
              {plan.stadtweit && (
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faMapLocation} />
                  <b style={styles.label}>stadtweites Vorhaben</b>
                </div>
              )}
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
                <div className="flex gap-2">
                  <FontAwesomeIcon
                    icon={faMagnifyingGlassLocation}
                    style={{ marginTop: "4px" }}
                  />

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
                  <div className="flex gap-2">
                    <FontAwesomeIcon icon={faBullseye} className="mt-[8px]" />

                    <b style={styles.label} className="mt-[5px]">
                      {" "}
                      Fokusraum STEK{" "}
                      <span>
                        {" "}
                        <a href={focusRoomLink} target="_blank">
                          (?)
                        </a>
                      </span>
                      :
                    </b>
                    <div style={styles.focusRoomValues}>
                      {focusRoom.map((i, idx) => (
                        <Tag className="my-1" key={idx}>
                          {i}
                        </Tag>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {completion && (
                <div style={styles.row} className="ml-[2px]">
                  <FontAwesomeIcon icon={faCalendarMinus} />

                  <b style={styles.label}>Voraussichtlicher Abschluss:</b>
                  <span style={styles.value}>
                    {completion} {" Quartal"}
                    {plan?.ende_jahr ? ` ${plan?.ende_jahr}` : ""}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="px-[10px]">
            <div className="py-[12px]">
              <b className="text-[16px]">Beschreibung: </b>
              <div className="mt-1">
                <span style={{ whiteSpace: "pre-line" }}>
                  {plan.beschreibung}{" "}
                </span>
                <div className="mt-1">
                  {plan?.link && (
                    <a href={plan.link} target="_blank">
                      Mehr Informationen…
                    </a>
                  )}
                </div>
              </div>
            </div>
            {photos && (
              <PhotoGallery photos={photos} handleImgClick={handleImgClick} />
            )}

            <br />
            {sortedResolutions.length > 0 && (
              <Accordion style={{ marginBottom: 6 }} defaultActiveKey={"0"}>
                <Panel
                  header="Politische Beschlüsse"
                  eventKey="0"
                  bsStyle="info"
                >
                  <div>
                    {sortedResolutions.map((res, idx) => {
                      return (
                        <p key={idx}>
                          <span> ({formatDatum(res.datum)}) </span>
                          <a href={res.url} target="_blank">
                            {res.anzeige}
                          </a>
                        </p>
                      );
                    })}
                  </div>
                </Panel>
              </Accordion>
            )}

            {citizenText && (
              <Accordion style={{ marginBottom: 6 }} defaultActiveKey={"1"}>
                <Panel
                  header="Bürger­beteiligung"
                  eventKey="1"
                  bsStyle="success"
                >
                  <div className="mb-1" style={{ whiteSpace: "pre-line" }}>
                    {citizenText}
                  </div>
                  {citizenUrl && (
                    <a href={citizenUrl} target="_blank">
                      Mehr Informationen...
                    </a>
                  )}
                </Panel>
              </Accordion>
            )}
            {documents.length > 0 && (
              <Accordion style={{ marginBottom: 6 }} defaultActiveKey={"2"}>
                <Panel header="Anhang" eventKey="2" bsStyle="warning">
                  <ul className="ml-[-22px]">
                    {documents.map((res, idx) => {
                      return (
                        <li key={idx}>
                          <a
                            href={assetsBaseUrl + docsPrefix + res.url}
                            target="_blank"
                          >
                            {res?.anzeige ? res?.anzeige : res.url}
                          </a>
                        </li>
                      );
                    })}

                    {plan.links &&
                      plan.links.map((res, idx) => {
                        return (
                          <li key={idx}>
                            <a href={res.url} target="_blank">
                              {res?.anzeige ? res?.anzeige : res.url}
                            </a>
                          </li>
                        );
                      })}
                  </ul>
                </Panel>
              </Accordion>
            )}
            {(phone || email) && <Contacts phone={phone} email={email} />}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <SecondaryInfoFooter close={close} version={versionString} />
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default SecondaryInfoModal;
