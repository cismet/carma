import { useContext } from "react";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { getSimpleHelpForTM } from "react-cismap/tools/uiHelper";
import ConfigurableDocBlocks from "react-cismap/topicmaps/ConfigurableDocBlocks";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-scroll";

import { getFilter } from "../../../core/store/slices/featureCollection";
import CacheSettings from "./CacheSettings";
import Filter from "./Filter";
import MenuFooter from "./MenuFooter";
import Tasks from "./Tasks";
import Teams from "./Teams";

const MyMenu = ({ refRoutedMap }) => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  const filterState = useSelector(getFilter);
  const dispatch = useDispatch();

  let simpleHelp = "";
  return (
    <ModalApplicationMenu
      menuIcon={"bars"}
      menuTitle={"Cache, Filter, Einstellungen und Kompaktanleitung"}
      menuIntroduction={
        <span>
          Benutzen Sie die Auswahlmöglichkeiten im Bereich{" "}
          <Link
            className='useAClassNameToRenderProperLink'
            to='filter'
            containerId='myMenu'
            smooth={true}
            delay={100}
            onClick={() => setAppMenuActiveMenuSection("filter")}
          >
            Lokale Daten
          </Link>{" "}
          um den Cache der offline verfügbaren Daten zu aktualisieren oder den Fortschritt des
          Aktualisierungsprozesses zu überwachen. Über{" "}
          <Link
            className='useAClassNameToRenderProperLink'
            to='filter'
            containerId='myMenu'
            smooth={true}
            delay={100}
            onClick={() => setAppMenuActiveMenuSection("filter")}
          >
            Filter
          </Link>
          , können Sie die in der Karte angezeigten BelIS Objekte auf die für Sie relevanten Typen
          beschränken. Über{" "}
          <Link
            className='useAClassNameToRenderProperLink'
            to='settings'
            containerId='myMenu'
            smooth={true}
            delay={100}
            onClick={() => setAppMenuActiveMenuSection("settings")}
          >
            Einstellungen
          </Link>{" "}
          können Sie die Darstellung der Hintergrundkarte anpassen. Wählen Sie die{" "}
          <Link
            className='useAClassNameToRenderProperLink'
            to='help'
            containerId='myMenu'
            smooth={true}
            delay={100}
            onClick={() => setAppMenuActiveMenuSection("help")}
          >
            Kompaktanleitung
          </Link>{" "}
          für detailliertere Bedienungsinformationen.
        </span>
      }
      menuSections={[
        <Section
          key='cache'
          sectionKey='cache'
          sectionTitle={"Lokale Daten"}
          sectionBsStyle='success'
          sectionContent={<CacheSettings />}
        />,
        <Section
          key='tasks'
          sectionKey='tasks'
          sectionTitle={"Tasks"}
          sectionBsStyle='success'
          sectionContent={<Tasks />}
        />,
        <Section
          key='teams'
          sectionKey='teams'
          sectionTitle={"Teams"}
          sectionBsStyle='warning'
          sectionContent={<Teams />}
        />,
        <Section
          key='filter'
          sectionKey='filter'
          sectionTitle={"Filter"}
          sectionBsStyle='info'
          sectionContent={<Filter refRoutedMap={refRoutedMap} />}
        />,
        <DefaultSettingsPanel
          key='settings'
          skipFilterTitleSettings={true}
          skipClusteringSettings={true}
          skipSymbolsizeSetting={true}
          sectionBsStyle='default'
        />,
        // <Section
        //   key='settings'
        //   sectionKey='settings'
        //   sectionTitle={"Einstellungen"}
        //   sectionBsStyle='danger'
        //   sectionContent={<div></div>}
        // ></Section>,

        <Section
          key='help'
          sectionKey='help'
          sectionTitle='Kompaktanleitung'
          sectionBsStyle='default'
          sectionContent={
            <ConfigurableDocBlocks configs={getSimpleHelpForTM("Belis-Online 3.0", simpleHelp)} />
          }
        />,
      ]}
      menuFooter={<MenuFooter />}
    />
  );
};
export default MyMenu;
