import {
  faBicycle,
  faChargingStation,
  faPhoneFlip,
  faQuestion,
  faSquareArrowUpRight,
  faSquareEnvelope,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";
import { Button, Modal, Accordion, Card, Table } from "react-bootstrap";
import { SecondaryInfoFooter } from "@carma-collab/wuppertal/e-bikes";
import versionData from "../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { changeUnreadableColor, formatIsoString } from "../../helper/styler";
import { MenuFooter } from "@carma-collab/wuppertal/commons";

const SecondaryInfoModal = ({ feature, setOpen }) => {
  const close = () => {
    setOpen(false);
  };

  const plan = feature.properties;
  const district = plan?.kst_stadtbezirk?.name || "stadtweites Vorhaben";
  const street = plan?.strasse || null;
  const locationDescription = plan?.ortsbeschreibung || null;
  const focusRoom = plan?.stek || [];
  const resolutions = plan?.beschluesse ? [...plan.beschluesse] : [];

  const sortedResolutions = resolutions.sort((a, b) =>
    b.datum.localeCompare(a.datum)
  );

  console.log("xxx plan", sortedResolutions);
  let links: any = [];

  // if (ladestation.betreiber) {
  //   if (ladestation?.betreiber?.telefon) {
  //     links.push(
  //       <a
  //         title="Beitreiber anrufen"
  //         href={"tel:" + ladestation?.betreiber?.telefon}
  //       >
  //         <FontAwesomeIcon
  //           icon={faPhoneFlip}
  //           style={{ color: "grey", width: "26px", textAlign: "center" }}
  //           size="2x"
  //         />
  //       </a>
  //     );
  //   }
  //   if (ladestation?.betreiber?.email || ladestation.email) {
  //     const mail = ladestation?.betreiber?.email
  //       ? ladestation?.betreiber?.email
  //       : ladestation.email;
  //     links.push(
  //       <a
  //         title="E-Mail an den Betreiber schreiben"
  //         href={"mailto:" + mail}
  //         target="_blank"
  //       >
  //         <FontAwesomeIcon
  //           icon={faSquareEnvelope}
  //           style={{ color: "grey", width: "26px", textAlign: "center" }}
  //           size="2x"
  //         />
  //       </a>
  //     );
  //   }
  //   if (ladestation?.betreiber?.web) {
  //     links.push(
  //       <a
  //         title="Betreiberwebseite"
  //         href={ladestation?.betreiber?.web}
  //         target="_blank"
  //       >
  //         <FontAwesomeIcon
  //           icon={faSquareArrowUpRight}
  //           style={{ color: "grey", width: "26px", textAlign: "center" }}
  //           size="2x"
  //         />
  //       </a>
  //     );
  //   }
  // } else {
  //   if (ladestation.telefon) {
  //     links.push(
  //       <a title="Beitreiber anrufen" href={"tel:" + ladestation?.telefon}>
  //         <FontAwesomeIcon
  //           icon={faPhoneFlip}
  //           style={{ color: "grey", width: "26px", textAlign: "center" }}
  //           size="2x"
  //         />
  //       </a>
  //     );
  //   }

  //   if (ladestation.email) {
  //     links.push(
  //       <a
  //         title="E-Mail an den Betreiber schreiben"
  //         href={"mailto:" + ladestation?.email}
  //         target="_blank"
  //       >
  //         <FontAwesomeIcon
  //           icon={faSquareEnvelope}
  //           style={{ color: "grey", width: "26px", textAlign: "center" }}
  //           size="2x"
  //         />
  //       </a>
  //     );
  //   }

  //   if (ladestation.homepage) {
  //     links.push(
  //       <a
  //         title="Betreiberwebseite"
  //         href={ladestation?.homepage}
  //         target="_blank"
  //       >
  //         <FontAwesomeIcon
  //           icon={faSquareArrowUpRight}
  //           style={{ color: "grey", width: "26px", textAlign: "center" }}
  //           size="2x"
  //         />
  //       </a>
  //     );
  //   }
  // }

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
          <FontAwesomeIcon icon={faSquareEnvelope} />
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
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            <div>
              <b>Letzte Aktualisierung:</b>
            </div>
            <div>{formatIsoString(plan.letzte_aktualisierung)}</div>
            <br />
            <div>
              <b>Stadtbezirk:</b>
              <div>{district}</div>
            </div>
            {street && (
              <>
                <br />
                <div>
                  <b>Adresse:</b>
                  <div>
                    {street} {plan?.hausnummer ? plan?.hausnummer : ""}
                  </div>
                </div>
              </>
            )}
            {locationDescription && (
              <>
                <br />
                <div>
                  <b>Ortsbeschreibung:</b>
                  <div>{street}</div>
                </div>
              </>
            )}
            <br />
            <div>
              <b>Thema:</b>
              <div>{plan.thema.name}</div>
            </div>
            {focusRoom.length > 0 && (
              <>
                <br />
                <div>
                  <b>Fokusraum STEK:</b>
                  <ul>
                    {focusRoom.map((i, idx) => (
                      <li key={idx}>{i}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
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
