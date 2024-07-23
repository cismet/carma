import { useContext } from 'react';
import CustomizationContextProvider from 'react-cismap/contexts/CustomizationContextProvider';
import { FeatureCollectionContext } from 'react-cismap/contexts/FeatureCollectionContextProvider';
import ModalApplicationMenu from 'react-cismap/topicmaps/menu/ModalApplicationMenu';
import Section from 'react-cismap/topicmaps/menu/Section';
import DefaultSettingsPanel from 'react-cismap/topicmaps/menu/DefaultSettingsPanel';

import Introduction from './menu/Introduction';
import HelpSection from './menu/HelpSection';
import FilterUI from './menu/FilterUI';
import Footer from './menu/Footer';

const Menu = () => {
  const { filteredItems, shownFeatures } = useContext(FeatureCollectionContext);

  const getFilterHeader = () => {
    const count = filteredItems?.length || 0;

    let term;
    if (count === 1) {
      term = 'Angebot';
    } else {
      term = 'Angebote';
    }

    return `Filtern (${count} ${term} gefunden, davon ${
      shownFeatures?.length || '0'
    } in der Karte)`;
  };

  return (
    <CustomizationContextProvider customizations={{}}>
      <ModalApplicationMenu
        menuIcon={'bars'}
        menuTitle={'Filter, Einstellungen und Kompaktanleitung'}
        menuFooter={<Footer />}
        menuIntroduction={<Introduction />}
        menuSections={[
          <Section
            key="filter"
            sectionKey="filter"
            sectionTitle={getFilterHeader()}
            sectionBsStyle="primary"
            sectionContent={<FilterUI />}
          />,
          <DefaultSettingsPanel key="settings" />,
          <HelpSection />,
        ]}
      />
    </CustomizationContextProvider>
  );
};

export default Menu;
