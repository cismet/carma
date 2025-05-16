import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { getUiState, showSettings } from "../../../store/slices/ui";
import { useDispatch, useSelector } from "react-redux";
import Menu99Footer from "./Menu99Footer";
import {
  modalMenuTitleText,
  Introduction,
  Menu10Datengrundlagen,
  Menu20MeinKassenzeichen,
  Menu40Anleitung,
  Menu41Mailservice,
  Menu42Aenderungen,
  Menu50FAQ,
  Menu60Datenschutz,
} from "@carma-collab/wuppertal/verdis-online";
import Menu30Kartenhintergruende from "./Menu30Kartenhintergruende";
import { getMapping } from "../../../store/slices/mapping";

const ModalHelpAndInfo = () => {
  const uiState = useSelector(getUiState);
  const mapping = useSelector(getMapping);
  const dispatch = useDispatch();
  return (
    <ModalApplicationMenu
      menuIcon={"info"}
      menuTitle={modalMenuTitleText}
      menuFooter={<Menu99Footer />}
      menuIntroduction={<Introduction />}
      visible={uiState.settingsVisible}
      setVisible={(value) => dispatch(showSettings({ visible: value }))}
      menuSections={[
        <Menu10Datengrundlagen />,
        <Menu20MeinKassenzeichen />,
        <Menu30Kartenhintergruende
          key="Kartenhintergruende"
          selectedBackgroundIndex={mapping.selectedBackgroundIndex}
          backgrounds={mapping.backgrounds}
          urlSearch={""}
        />,
        <Menu40Anleitung />,
        <Menu41Mailservice />,
        <Menu42Aenderungen />,
        <Menu50FAQ />,
        <Menu60Datenschutz />,
      ]}
    />
  );
};

export default ModalHelpAndInfo;
