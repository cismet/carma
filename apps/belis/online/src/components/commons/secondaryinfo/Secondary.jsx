import { useWindowSize } from "@react-hook/window-size";
import PropTypes from "prop-types";
import React from "react";
import { Button, Modal } from "react-bootstrap";
import Icon from "react-cismap/commons/Icon";
import CismetFooterAcks from "react-cismap/topicmaps/wuppertal/CismetFooterAcknowledgements";
import GenericRVRStadtplanwerkMenuFooter from "react-cismap/topicmaps/wuppertal/GenericRVRStadtplanwerkMenuFooter";

const Comp = ({
  visible,
  uiHeight,
  setVisibleState,
  modalBodyStyle,
  title,
  titleIconName,
  mainSection,
  subSections,
  imageUrl,
  imageStyle,
  footer = (
    <div>
      <span style={{ fontSize: "11px" }}>
        <CismetFooterAcks />
      </span>
    </div>
  ),
}) => {
  const [windowWidth, windowHeight] = useWindowSize();
  let _visible = visible;
  let _setVisibleState = setVisibleState;

  const close = () => {
    _setVisibleState(false);
  };
  if (modalBodyStyle === undefined) {
    modalBodyStyle = {
      overflowY: "auto",
      overflowX: "hidden",
      maxHeight: (uiHeight || windowHeight) - 200,
    };
  }

  return (
    <Modal
      style={{
        zIndex: 20000001,
      }}
      height='100%'
      size='xl'
      show={_visible}
      onHide={close}
      keyboard={false}
      enforceFocus={false}
    >
      <Modal.Header>
        <Modal.Title>
          {titleIconName !== undefined && <Icon name={titleIconName} />} {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={modalBodyStyle} id='myMenu'>
        <div style={{ width: "100%", minHeight: undefined }}>
          {imageUrl !== undefined && (
            <img
              alt='Bild'
              style={
                imageStyle || {
                  paddingLeft: 10,
                  paddingRight: 10,
                  float: "right",
                  paddingBottom: "5px",
                }
              }
              src={imageUrl}
              width='250'
            />
          )}
          {mainSection}
        </div>
        {subSections || []}
      </Modal.Body>
      <Modal.Footer>
        <table
          style={{
            width: "100%",
          }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  textAlign: "left",
                  verticalAlign: "bottom",
                  paddingRight: "30px",
                }}
              >
                {footer}
              </td>
              <td>
                <Button
                  id='cmdCloseModalApplicationMenu'
                  bsStyle='primary'
                  type='submit'
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

export default Comp;
Comp.propTypes = {
  menuIcon: PropTypes.string,
  menuTitle: PropTypes.string,
  menuIntroduction: PropTypes.object,
  menuSections: PropTypes.array,
  menuFooter: PropTypes.object,

  uiStateActions: PropTypes.object,
  uiState: PropTypes.object,
  kitasState: PropTypes.object,
  kitasActions: PropTypes.object,
  mappingState: PropTypes.object,
  mappingActions: PropTypes.object,
};

Comp.defaultProps = {
  menuIcon: "bars",
  menuTitle: "Einstellungen und Hilfe",
  menuSections: [],
  menuFooter: <GenericRVRStadtplanwerkMenuFooter />,
};
