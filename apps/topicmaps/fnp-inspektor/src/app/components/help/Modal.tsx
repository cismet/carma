import ModalApplicationMenu from 'react-cismap/topicmaps/menu/ModalApplicationMenu';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';
import { useContext } from 'react';
import Section from 'react-cismap/topicmaps/menu/Section';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationArrow } from '@fortawesome/free-solid-svg-icons';
import meinStandpunktMarkerDoppel from './MeinStandpunktMarkerDoppel.jpg';
import meinStandpunktMarkerMitKompass from './MeinStandpunktMarkerMitKompass.jpg';
import Icon from 'react-cismap/commons/Icon';
import Footer from './Footer';
import Introduction from './Introduction';
import RechtsplanUndArbeitskarte from './RechtsplanUndArbeitskarte';
import InKartePositionieren from './InKartePositionieren';
import MeinStandort from './MeinStandort';
import AenderungsverfahrenAnzeigenUndAbfragen from './AenderungsverfahrenAnzeigenUndAbfragen';
import AenderungsverfahrenSuchenUndDurchmustern from './AenderungsverfahrenSuchenUndDurchmustern';
import FlaechenInDerArbeitskarteAuswaehlenUndAbfragen from './FlaechenInDerArbeitskarteAuswaehlenUndAbfragen';
import DokumenteBetrachten from './DokumenteBetrachten';
import DokumenteHerunterladen from './DokumenteHerunterladen';

const Modal = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  return (
    <ModalApplicationMenu
      menuIcon={'info'}
      menuTitle={'Kompaktanleitung FNP-Inspektor Wuppertal'}
      menuIntroduction={<Introduction />}
      menuSections={[
        <RechtsplanUndArbeitskarte />,
        <InKartePositionieren />,
        <MeinStandort />,
        <AenderungsverfahrenAnzeigenUndAbfragen />,
        <AenderungsverfahrenSuchenUndDurchmustern />,
        <FlaechenInDerArbeitskarteAuswaehlenUndAbfragen />,
        <DokumenteBetrachten />,
        <DokumenteHerunterladen />,
      ]}
      menuFooter={<Footer />}
    />
  );
};

export default Modal;
