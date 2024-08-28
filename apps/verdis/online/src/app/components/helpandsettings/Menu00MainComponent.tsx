import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import { getUiState, showSettings } from "../../../store/slices/ui";
import { useDispatch, useSelector } from "react-redux";
import Menu99Footer from "./Menu99Footer";
import {
  modalMenuTitleText,
  Introduction,
  Menu10Datengrundlagen,
  Menu20MeinKassenzeichen,
  Menu30KartenhintergruendeText,
  Menu40Anleitung,
  Menu41Mailservice,
  Menu42Aenderungen,
  Menu50FAQ,
  Menu60Datenschutz,
} from "@carma-collab/wuppertal/verdis-online";

const ModalHelpAndInfo = () => {
  const uiState = useSelector(getUiState);
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
        <Section
          key="kartenhintergruende"
          sectionKey="kartenhintergruende"
          sectionTitle="Hintergrundkarten"
          sectionBsStyle="info"
          sectionContent={<Menu30KartenhintergruendeText />}
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
