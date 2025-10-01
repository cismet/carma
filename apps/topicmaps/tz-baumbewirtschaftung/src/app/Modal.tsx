import { Modal, Accordion } from "react-bootstrap";
// import { SecondaryInfoFooter } from "@carma-collab/wuppertal/e-bikes";

import Panel from "react-cismap/commons/Panel";

interface FeatureType {
  properties?: any;
  [key: string]: any;
}

const SecondaryInfoModal = ({
  feature = {},
  setOpen = () => {},
  versionString = "???",
  Footer,
}: {
  feature?: FeatureType;
  setOpen?: (open: boolean) => void;
  versionString?: string;
  Footer?: React.ComponentType<any>;
}) => {
  const close = () => {
    setOpen(false);
  };

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
      dialogClassName="modal-dialog-scrollable"
    >
      <Modal.Header>
        <Modal.Title>Test</Modal.Title>
      </Modal.Header>
      <Modal.Body id="myMenu" key={"prbr.secondaryInfo"}>
        <div>lorem ipsum dolor sit amet</div>
        <Accordion style={{ marginBottom: 6 }} defaultActiveKey={"0"}>
          <Panel header={"Test"} eventKey="0" bsStyle="info">
            <div>Lorem ipsum dolor sit amet</div>
          </Panel>
        </Accordion>
      </Modal.Body>
      <Modal.Footer>
        {/* <Footer close={close} version={versionString} /> */}
      </Modal.Footer>
    </Modal>
  );
};

export default SecondaryInfoModal;
