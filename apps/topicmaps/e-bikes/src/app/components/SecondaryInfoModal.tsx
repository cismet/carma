import {
  faBicycle,
  faChargingStation,
  faPhoneFlip,
  faQuestion,
  faSquareArrowUpRight,
  faSquareEnvelope,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Modal, Accordion, Card, Table } from 'react-bootstrap';

const SecondaryInfoModal = ({ feature, setOpen }) => {
  const close = () => {
    setOpen(false);
  };

  const ladestation = feature.properties;
  const isVerleih = ladestation.typ === 'Verleihstation';
  let foto;
  if (ladestation.foto !== undefined) {
    foto = ladestation.foto;
  }

  let links: any = [];
  if (ladestation?.betreiber?.telefon) {
    links.push(
      <a href={'tel:' + ladestation?.betreiber?.telefon}>
        <FontAwesomeIcon
          icon={faPhoneFlip}
          style={{ color: 'grey', width: '26px', textAlign: 'center' }}
          size="2x"
        />
      </a>
    );
  }
  if (ladestation?.betreiber?.email || ladestation.email) {
    links.push(
      <a
        href={
          'mailto:' + ladestation?.betreiber?.email
            ? ladestation?.betreiber?.email
            : ladestation.email
        }
        target="_blank"
      >
        <FontAwesomeIcon
          icon={faSquareEnvelope}
          style={{ color: 'grey', width: '26px', textAlign: 'center' }}
          size="2x"
        />
      </a>
    );
  }
  if (ladestation?.betreiber?.web) {
    links.push(
      <a href={ladestation?.betreiber?.homepage} target="_blank">
        <FontAwesomeIcon
          icon={faSquareArrowUpRight}
          style={{ color: 'grey', width: '26px', textAlign: 'center' }}
          size="2x"
        />
      </a>
    );
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
          <FontAwesomeIcon icon={faBicycle} />
          {` Datenblatt: Ladestation ${ladestation.standort}`}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body id="myMenu" key={'prbr.secondaryInfo'}>
        <div style={{ width: '100%', minHeight: 250 }}>
          {foto !== undefined && (
            <img
              alt="Bild"
              style={{
                paddingLeft: 10,
                paddingRight: 10,
                float: 'right',
                paddingBottom: '5px',
              }}
              src={foto}
              width="250"
            />
          )}
          <div style={{ fontSize: '115%', padding: '10px', paddingTop: '0px' }}>
            <div>
              <b>Adresse:</b>
            </div>
            <div>
              {ladestation.strasse} {ladestation.hausnummer}
            </div>
            <br />
            {isVerleih ? (
              <>
                <div>
                  <b>Weitere Informationen:</b>
                  <div>{ladestation.weitereinfo}</div>
                </div>
              </>
            ) : (
              <>
                {' '}
                <div>
                  <b>Detailinformation:</b>
                </div>
                <div>{ladestation.detailbeschreibung}</div>
              </>
            )}
            <br />
            {ladestation.bemerkung && (
              <>
                <div>
                  <b>Bemerkung:</b>
                </div>
                <div>{ladestation.bemerkung}</div>
                <br />
              </>
            )}
            <div>
              <b>Öffnungszeiten:</b> {ladestation.oeffnungszeiten}
            </div>
            <br />
            {!isVerleih && (
              <div>
                <b>Stellplätze:</b> {ladestation.anzahl_plaetze}
              </div>
            )}
          </div>
        </div>
        <Accordion style={{ marginBottom: 6 }} defaultActiveKey={'0'}>
          <Card style={{ backgroundColor: '#bce8f1' }}>
            <Card.Header>
              <Accordion.Toggle as={Button} variant="link" eventKey="0">
                {ladestation.typ === 'Verleihstation'
                  ? 'Verleih'
                  : 'Lademöglichkeit verfügbar'}
              </Accordion.Toggle>
            </Card.Header>
            <Accordion.Collapse eventKey="0">
              <Card.Body style={{ backgroundColor: 'white' }}>
                {ladestation.typ === 'Verleihstation' ? (
                  <>
                    <div style={{ marginBottom: 6 }}>
                      <b>Pedelecs:</b> {ladestation.anzahl_pedelec}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <b>Speed-Pedelecs:</b> {ladestation.anzahl_spedelec}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <b>E-Bikes:</b> {ladestation.anzahl_ebike}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <b>Lastenräder:</b> {ladestation.anzahl_lastenrad}
                    </div>
                    <div>
                      <b>Leihgebühr:</b> {ladestation.leihgebuehr}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      Es kann keine Aussage darüber getroffen werden, ob die
                      Station momentan besetzt ist.
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <b>Ladepunkte:</b> {ladestation.anzahl_plaetze}
                    </div>
                    <div>
                      <b>Steckerverbindungen:</b>
                      {ladestation.stecker.map((stecker) => {
                        return `${stecker.typ} (${stecker.leistung}kW, ${stecker.strom}A, ${stecker.spannung}V)`;
                      })}
                    </div>
                  </>
                )}
              </Card.Body>
            </Accordion.Collapse>
          </Card>
        </Accordion>
        {ladestation.typ !== 'Verleihstation' && (
          <Accordion style={{ marginBottom: 6 }} defaultActiveKey={'1'}>
            <Card style={{ backgroundColor: '#faebcc' }}>
              <Card.Header>
                <Accordion.Toggle as={Button} variant="link" eventKey="1">
                  Bezahlen
                </Accordion.Toggle>
              </Card.Header>
              <Accordion.Collapse eventKey="1">
                <Card.Body style={{ backgroundColor: 'white' }}>
                  <div>
                    <b>Authentifizierung:</b>{' '}
                    {ladestation.zugangsarten.join(' / ')}
                  </div>
                  <div>
                    <b>Ladekosten:</b> {ladestation.ladekosten}
                  </div>
                </Card.Body>
              </Accordion.Collapse>
            </Card>
          </Accordion>
        )}
        <Accordion style={{ marginBottom: 6 }} defaultActiveKey={'2'}>
          <Card style={{ backgroundColor: '#d6e9c6' }}>
            <Card.Header>
              <Accordion.Toggle as={Button} variant="link" eventKey="2">
                Betreiber
              </Accordion.Toggle>
            </Card.Header>
            <Accordion.Collapse eventKey="2">
              <Card.Body style={{ backgroundColor: 'white' }}>
                <div
                  style={{
                    paddingLeft: 10,
                    paddingRight: 10,
                    float: 'right',
                    paddingBottom: '5px',
                  }}
                >
                  {links}
                </div>
                <div>
                  {ladestation?.betreiber?.name || ladestation.standort}
                </div>
                <div>
                  {ladestation?.betreiber?.strasse || ladestation.strasse}{' '}
                  {ladestation?.betreiber?.hausnummer || ladestation.hausnummer}
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
        <table
          style={{
            width: '100%',
          }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  textAlign: 'left',
                  verticalAlign: 'bottom',
                  paddingRight: '30px',
                }}
              >
                <div>
                  <span style={{ fontSize: '11px' }}>
                    <div>
                      <b>TopicMaps Wuppertal</b> (Version 1.22.3):{' '}
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
                  </span>
                </div>
              </td>
              <td>
                <Button
                  id="cmdCloseModalApplicationMenu"
                  type="submit"
                  onClick={close}
                >
                  Ok
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </Modal.Footer>
    </Modal>
  );
};

export default SecondaryInfoModal;
