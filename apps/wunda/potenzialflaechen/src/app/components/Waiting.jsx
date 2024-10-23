import { useContext } from "react";
import Modal from "react-bootstrap/Modal";
import IconComp from "react-cismap/commons/Icon";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import ReactLoading from "react-loading";

const Waiting = ({ waiting }) => {
  const { selectedFeature } = useContext(FeatureCollectionContext);

  return (
    <Modal
      style={{
        zIndex: 3000000000,
      }}
      height='200'
      size='s'
      show={waiting !== undefined}
      //   onHide={close}
      keyboard={false}
    >
      <Modal.Header>
        <Modal.Title>
          <IconComp name={waiting?.icon} /> {waiting?.title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "baseline" }}>
          <ReactLoading type={"cylon"} color={selectedFeature?.properties.color} />{" "}
          <div style={{ marginLeft: 20 }}>{waiting?.text}</div>
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default Waiting;
