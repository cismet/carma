import { Modal, Accordion } from "react-bootstrap";
import { Descriptions } from "antd";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Panel from "react-cismap/commons/Panel";
import type { LeerstandPhoto, LeerstandProperties } from "./helper/leerstandApi";

interface SecondaryInfoModalProps {
  feature?: { properties?: Partial<LeerstandProperties> };
  setOpen?: (open: boolean) => void;
  versionString?: string;
  Footer?: React.ComponentType<{ close: () => void; version: string }>;
}

const formatDate = (value?: string | null) => {
  if (!value) return "–";
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString("de-DE");
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "–";
  const d = new Date(value);
  return isNaN(d.getTime())
    ? value
    : `${d.toLocaleDateString("de-DE")} ${d.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
};

const dash = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === "" ? "–" : String(value);

/** datasheet of a Leerstand, opened from the info box (see tzb Modal.tsx) */
const SecondaryInfoModal = ({
  feature = {},
  setOpen = () => {},
  versionString = "???",
  Footer,
}: SecondaryInfoModalProps) => {
  const close = () => setOpen(false);
  const p = feature.properties || {};
  const fotos: LeerstandPhoto[] = Array.isArray(p.fotos) ? p.fotos : [];
  const groups = new Map<string, LeerstandPhoto[]>();
  for (const foto of fotos) {
    const key = foto.artName ?? "Fotos";
    groups.set(key, [...(groups.get(key) ?? []), foto]);
  }

  return (
    <Modal
      style={{ zIndex: 2900000000 }}
      height="100%"
      size="lg"
      show={true}
      onHide={close}
      keyboard={false}
      dialogClassName="modal-dialog-scrollable"
    >
      <Modal.Header
        style={{
          backgroundColor: "#fafafa",
          borderBottom: "1px solid #e0e0e0",
          padding: "12px 20px",
        }}
      >
        <Modal.Title style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
          <FontAwesomeIcon icon={faInfoCircle} style={{ fontSize: "18px" }} />
          <span>Leerstand</span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body id="myMenu" key="leerstand.secondaryInfo">
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>
            {p.nutzungsart ? `Leerstand: ${p.nutzungsart}` : `Leerstand ${p.id ?? ""}`}
          </h2>
          <div style={{ fontSize: "16px", color: "#666" }}>{p.zus_adressangabe}</div>
        </div>

        <Accordion style={{ marginBottom: 6 }} defaultActiveKey="0">
          <Panel header="Objektdaten" eventKey="0" bsStyle="success">
            <Descriptions column={1} layout="horizontal" bordered size="small">
              <Descriptions.Item label="Fläche">
                {p.flaechengroesse != null ? `${p.flaechengroesse} m²` : "–"}
              </Descriptions.Item>
              <Descriptions.Item label="Geschosse">{dash(p.geschosse)}</Descriptions.Item>
              {(p.geschosse ?? 0) > 1 && (
                <Descriptions.Item label="Rolltreppe / Personenaufzug / Lastenaufzug">
                  {dash(p.rolltreppe)} / {dash(p.personenaufzug)} / {dash(p.lastenaufzug)}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Vorherige Nutzungsart">
                {dash(p.nutzungsart)}
              </Descriptions.Item>
              <Descriptions.Item label="Vorherige Nutzung">
                {dash(p.vorherige_nutzung)}
              </Descriptions.Item>
              <Descriptions.Item label="Für Gastronomie interessant">
                {dash(p.gastronomie)}
                {p.gastronomie_begruendung ? `: ${p.gastronomie_begruendung}` : ""}
              </Descriptions.Item>
              <Descriptions.Item label="Ausstattung">{dash(p.ausstattung)}</Descriptions.Item>
              <Descriptions.Item label="Sonstige Hinweise">
                {dash(p.sonstige_hinweise)}
              </Descriptions.Item>
              <Descriptions.Item label="Quelle">{dash(p.quelle)}</Descriptions.Item>
              <Descriptions.Item label="Link">
                {p.link ? (
                  <a href={p.link} target="_blank" rel="noreferrer">
                    {p.link}
                  </a>
                ) : (
                  "–"
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Verfügbar seit/ab">
                {p.verfuegbar ? formatDate(p.verfuegbar) : "unbekannt"}
              </Descriptions.Item>
              <Descriptions.Item label="Erfasst">
                {dash(p.erfasser)} am {formatDate(p.erfassungsdatum)}
              </Descriptions.Item>
              <Descriptions.Item label="Letzte Änderung">
                {dash(p.letzte_aenderung_nutzer)} am {formatDateTime(p.letzte_aenderung_zeit)}
              </Descriptions.Item>
            </Descriptions>
          </Panel>
        </Accordion>

        <Accordion style={{ marginBottom: 6 }} defaultActiveKey="1">
          <Panel header="Fotos" eventKey="1" bsStyle="info">
            {fotos.length === 0 ? (
              <div style={{ padding: "20px", color: "#999", textAlign: "center" }}>
                Keine Fotos vorhanden
              </div>
            ) : (
              [...groups.entries()].map(([name, groupFotos]) => (
                <div key={name} style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{name}</div>
                  <div className="ls-photo-grid">
                    {groupFotos.map((foto) => (
                      <a key={foto.link} href={foto.link} target="_blank" rel="noreferrer">
                        <img src={foto.link} alt={foto.beschreibung ?? name} loading="lazy" />
                      </a>
                    ))}
                  </div>
                </div>
              ))
            )}
          </Panel>
        </Accordion>
      </Modal.Body>
      <Modal.Footer>
        {Footer && <Footer close={close} version={versionString} />}
      </Modal.Footer>
    </Modal>
  );
};

export default SecondaryInfoModal;
