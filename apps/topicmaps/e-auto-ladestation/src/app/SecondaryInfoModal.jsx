import {
  faChargingStation,
  faPhoneFlip,
  faQuestion,
  faSquareArrowUpRight,
  faSquareEnvelope,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Modal, Accordion, Card, Table } from "react-bootstrap";
import { getConnectorImageUrl } from "./helper/helper";
import { SecondaryInfoFooter } from "@carma-collab/wuppertal/e-auto-ladestation";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";

const SecondaryInfoModal = ({ feature, setOpen }) => {
  const close = () => {
    setOpen(false);
  };

  const ladestation = feature.properties;
  let foto;
  if (ladestation.foto !== undefined) {
    foto = ladestation.foto;
  }

  let links = [];
  if (ladestation?.betreiber?.telefon) {
    links.push(
      <a href={"tel:" + ladestation?.betreiber?.telefon}>
        <FontAwesomeIcon
          icon={faPhoneFlip}
          style={{ color: "grey", width: "26px", textAlign: "center" }}
          size="2x"
        />
      </a>,
    );
  }
  if (ladestation?.betreiber?.email) {
    links.push(
      <a href={"mailto:" + ladestation?.betreiber?.email} target="_blank">
        <FontAwesomeIcon
          icon={faSquareEnvelope}
          style={{ color: "grey", width: "26px", textAlign: "center" }}
          size="2x"
        />
      </a>,
    );
  }
  if (ladestation?.betreiber?.homepage) {
    links.push(
      <a href={ladestation?.betreiber?.homepage} target="_blank">
        <FontAwesomeIcon
          icon={faSquareArrowUpRight}
          style={{ color: "grey", width: "26px", textAlign: "center" }}
          size="2x"
        />
      </a>,
    );
  }

  let steckerverbindungenTableArr = [];
  if (
    ladestation.steckerverbindungen &&
    ladestation.steckerverbindungen.length > 0
  ) {
    ladestation.steckerverbindungen.forEach((v, index) => {
      for (let i = 0; i < v.anzahl; ++i) {
        let imageUrl =
          "https://wunda-geoportal.cismet.de/" +
          getConnectorImageUrl(v.steckdosentypkey);
        let image;

        if (imageUrl) {
          image = (
            <img
              alt={v.steckdosentypkey}
              src={imageUrl}
              width="50"
              onError={({ currentTarget }) => {
                currentTarget.onerror = null; // prevents looping
                currentTarget.src = "/images/emob/dynamic/unknown.png";
              }}
            />
          );
        } else {
          image = <FontAwesomeIcon icon={faQuestion} />;
        }
        steckerverbindungenTableArr.push(
          <tr key={index + "." + i}>
            <td
              style={{
                verticalAlign: "middle",
                textAlign: "center",
              }}
            >
              {image}
            </td>
            <td style={{ verticalAlign: "middle" }}>{v.steckdosentyp}</td>
            <td style={{ verticalAlign: "middle" }}>
              {v.leistung}kW
              {v.strom && v.spannung ? ` (${v.strom}A, ${v.spannung}V)` : ``}
              {v.strom && !v.spannung ? ` (${v.strom}A)` : ``}
              {!v.strom && v.spannung ? ` (${v.spannung}V)` : ``}
            </td>
          </tr>,
        );
      }
    });
  }

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
          <FontAwesomeIcon icon={faChargingStation} />
          {` Datenblatt: Ladestation ${ladestation.name}`}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body id="myMenu" key={"prbr.secondaryInfo"}>
        <div style={{ width: "100%", minHeight: 250 }}>
          {foto !== undefined && (
            <img
              alt="Bild"
              style={{
                paddingLeft: 10,
                paddingRight: 10,
                float: "right",
                paddingBottom: "5px",
              }}
              src={foto}
              width="250"
            />
          )}
          <div style={{ fontSize: "115%", padding: "10px", paddingTop: "0px" }}>
            <div>
              <b>Adresse:</b>
            </div>
            <div>
              {ladestation.strasse} {ladestation.hausnummer}
            </div>
            <br />
            <div>{ladestation.detailbeschreibung}</div>
            <div> {ladestation.zusatzinfo}</div>
            <br />
            <div>
              <b>Öffnungszeiten:</b> {ladestation.oeffnungszeiten}
            </div>
          </div>
        </div>
        <Accordion style={{ marginBottom: 6 }} defaultActiveKey={"0"}>
          <Card style={{ backgroundColor: "#bce8f1" }}>
            <Card.Header>
              <Accordion.Toggle as={Button} variant="link" eventKey="0">
                {ladestation.online === true
                  ? "Lademöglichkeit verfügbar (online)"
                  : "Lademöglichkeit momentan nicht verfügbar (offline)"}
              </Accordion.Toggle>
            </Card.Header>
            <Accordion.Collapse eventKey="0">
              <Card.Body style={{ backgroundColor: "white" }}>
                <div>
                  <b>Ladepunkte:</b> {ladestation.ladeplaetze}
                </div>
                <div>
                  <b>Steckerverbindungen:</b>
                  <Table
                    striped
                    bordered
                    condensed
                    hover
                    style={{ marginTop: 8 }}
                  >
                    <tbody>{steckerverbindungenTableArr}</tbody>
                  </Table>
                  <div style={{ textAlign: "right" }}>
                    <a
                      href="https://github.com/cismet/wupp-topic-maps/blob/feature/039-winter-2019-dev-sprint/public/images/emob/"
                      target="_license"
                    >
                      Bildnachweis
                    </a>
                  </div>
                </div>
                <div>
                  <b>Strom:</b> {ladestation.stromart}
                </div>
                <div>
                  <b>Schnellladestation:</b>{" "}
                  {ladestation.schnellladestation === true ? "Ja" : "Nein"}
                </div>
              </Card.Body>
            </Accordion.Collapse>
          </Card>
        </Accordion>
        <Accordion style={{ marginBottom: 6 }} defaultActiveKey={"1"}>
          <Card style={{ backgroundColor: "#faebcc" }}>
            <Card.Header>
              <Accordion.Toggle as={Button} variant="link" eventKey="1">
                Bezahlen
              </Accordion.Toggle>
            </Card.Header>
            <Accordion.Collapse eventKey="1">
              <Card.Body style={{ backgroundColor: "white" }}>
                <div>
                  <b>Authentifizierung:</b>{" "}
                  {ladestation.authentifizierung.join(" / ")}
                </div>
                <div>
                  <b>Ladekosten:</b>{" "}
                  {ladestation.ladekosten.startsWith("http") ? (
                    <a href={ladestation.ladekosten} target="_ladekosten">
                      in anderem Fenster anschauen
                    </a>
                  ) : (
                    ladestation.ladekosten
                  )}
                </div>
                <div>
                  <b>Parkgebühr:</b> {ladestation.parkgebuehr}
                </div>
              </Card.Body>
            </Accordion.Collapse>
          </Card>
        </Accordion>
        <Accordion style={{ marginBottom: 6 }} defaultActiveKey={"2"}>
          <Card style={{ backgroundColor: "#d6e9c6" }}>
            <Card.Header>
              <Accordion.Toggle as={Button} variant="link" eventKey="2">
                Betreiber
              </Accordion.Toggle>
            </Card.Header>
            <Accordion.Collapse eventKey="2">
              <Card.Body style={{ backgroundColor: "white" }}>
                <div
                  style={{
                    paddingLeft: 10,
                    paddingRight: 10,
                    float: "right",
                    paddingBottom: "5px",
                  }}
                >
                  {links}
                </div>
                <div>{ladestation?.betreiber?.name}</div>
                <div>
                  {ladestation?.betreiber?.strasse}{" "}
                  {ladestation?.betreiber?.hausnummer}
                </div>
                <div>
                  {ladestation?.betreiber?.plz} {ladestation?.betreiber?.ort}
                </div>
                <br />
              </Card.Body>
            </Accordion.Collapse>
          </Card>
        </Accordion>
      </Modal.Body>
      <Modal.Footer>
        <SecondaryInfoFooter
          close={close}
          version={getApplicationVersion(versionData)}
        />
      </Modal.Footer>
    </Modal>
  );
};

export default SecondaryInfoModal;
