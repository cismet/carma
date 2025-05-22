import { useSelector, useDispatch } from "react-redux";
import { Modal, ProgressBar, Button } from "react-bootstrap";
import { getUiState, showWaiting } from "../../store/slices/ui";
import { WAITING_TYPE_ERROR, WAITING_TYPE_INFO } from "../../constants/ui";

const Waiting = () => {
  const dispatch = useDispatch();
  const { waitingVisible, waitingMessage, waitingType, waitingUIAnimation } =
    useSelector(getUiState);

  const handleClose = () => {
    dispatch(showWaiting(false));
  };

  const title = waitingMessage || "Laden";

  const variant =
    waitingType === WAITING_TYPE_ERROR
      ? "danger"
      : waitingType === WAITING_TYPE_INFO
      ? "info"
      : undefined;

  const footer =
    waitingType === WAITING_TYPE_ERROR ? (
      <Modal.Footer>
        <Button onClick={handleClose}>Ok</Button>
      </Modal.Footer>
    ) : (
      <Modal.Footer />
    );

  return (
    <Modal
      animation={waitingUIAnimation}
      show={waitingVisible}
      onHide={handleClose}
    >
      <Modal.Header>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ProgressBar
          variant={variant}
          animated={waitingUIAnimation}
          now={100}
        />
      </Modal.Body>
      {footer}
    </Modal>
  );
};

export default Waiting;
