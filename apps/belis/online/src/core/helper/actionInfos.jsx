import {
  faCalendarAlt,
  faHdd,
  faLightbulb,
  faMinusSquare,
} from "@fortawesome/free-regular-svg-icons";
import {
  faAsterisk,
  faBatteryEmpty,
  faBinoculars,
  faBolt,
  faCheckCircle,
  faExclamationCircle,
  faFileInvoice,
  faFilter,
  faInbox,
  faPaintRoller,
  faPlus,
  faSignal,
  faStream,
  faSync,
  faTasks,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React from "react";

export const protocolActionInfos = {
  protokollStatusAenderung: {
    actionname: "protokollStatusAenderung",
    title: "Status",
    icon: (
      <span className='fa-layers fa-fw' title='Statusänderung'>
        <FontAwesomeIcon icon={faTasks}></FontAwesomeIcon>
      </span>
    ),
  },
  leuchtenerneuerung: {
    actionname: "protokollLeuchteLeuchtenerneuerung",
    title: "Leuchtenerneuerung",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faFilter} transform='rotate-180'></FontAwesomeIcon>
        <FontAwesomeIcon icon={faSync} transform='shrink-9 right-10 up-5'></FontAwesomeIcon>
      </span>
    ),
  },
  leuchtmittelwechselEP: {
    actionname: "protokollLeuchteLeuchtmittelwechselElekpruefung",
    title: "Leuchtmittelwechsel mit EP",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faLightbulb} transform='rotate-180'></FontAwesomeIcon>
        <FontAwesomeIcon icon={faSync} transform='shrink-9 right-10 up-5'></FontAwesomeIcon>
        <FontAwesomeIcon
          icon={faCheckCircle}
          transform='shrink-9 right-10 down-5'
        ></FontAwesomeIcon>
      </span>
    ),
  },
  leuchtmittelwechsel: {
    actionname: "protokollLeuchteLeuchtmittelwechsel",
    title: "Leuchtmittelwechsel",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faLightbulb} transform='rotate-180'></FontAwesomeIcon>
        <FontAwesomeIcon icon={faSync} transform='shrink-9 right-10 up-5'></FontAwesomeIcon>
      </span>
    ),
  },

  rundsteuerempfaengerwechsel: {
    actionname: "protokollLeuchteRundsteuerempfaengerwechsel",
    title: "Rundsteuerempfängerwechsel",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faMinusSquare} transform='shrink-1 left-2 up-1'></FontAwesomeIcon>
        <FontAwesomeIcon icon={faSignal} transform='shrink-9 right-10 down-5'></FontAwesomeIcon>
        <FontAwesomeIcon icon={faSync} transform='shrink-9 right-11 up-5'></FontAwesomeIcon>
      </span>
    ),
  },
  sonderturnus: {
    actionname: "protokollLeuchteSonderturnus",
    title: "Sonderturnus",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faCalendarAlt}></FontAwesomeIcon>
        <FontAwesomeIcon
          icon={faExclamationCircle}
          transform='shrink-9 right-11 down-5'
        ></FontAwesomeIcon>
      </span>
    ),
  },
  vorschaltgeraetewechsel: {
    actionname: "protokollLeuchteVorschaltgeraetwechsel",
    title: "Vorschaltgerätewechsel",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faHdd} transform='rotate-90'></FontAwesomeIcon>
        <FontAwesomeIcon icon={faSync} transform='shrink-9 right-11 up-5'></FontAwesomeIcon>
      </span>
    ),
  },
  anstricharbeiten: {
    actionname: "protokollStandortAnstricharbeiten",
    title: "Anstricharbeiten",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faPaintRoller}></FontAwesomeIcon>
      </span>
    ),
  },
  ep: {
    actionname: "protokollStandortElektrischePruefung",
    title: "Elektrische Prüfung",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faBolt}></FontAwesomeIcon>
        <FontAwesomeIcon icon={faCheckCircle} transform='shrink-9 right-10 up-5'></FontAwesomeIcon>
      </span>
    ),
  },
  masterneuerung: {
    actionname: "protokollStandortMasterneuerung",
    title: "Masterneuerung",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faBatteryEmpty} transform='rotate-90 down-2'></FontAwesomeIcon>
        <FontAwesomeIcon icon={faSync} transform='shrink-9 right-10 up-5'></FontAwesomeIcon>
      </span>
    ),
  },
  standortrevision: {
    actionname: "protokollStandortRevision",
    title: "Revision",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faCalendarAlt}></FontAwesomeIcon>
        <FontAwesomeIcon
          icon={faCheckCircle}
          transform='shrink-9 right-11 down-5'
        ></FontAwesomeIcon>
      </span>
    ),
  },

  standsicherheitspruefung: {
    actionname: "protokollStandortStandsicherheitspruefung",
    title: "Standsicherheitsprüfung",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faBatteryEmpty} transform='rotate-90 down-2'></FontAwesomeIcon>

        <FontAwesomeIcon
          icon={faCheckCircle}
          transform='shrink-9 right-11 down-5'
        ></FontAwesomeIcon>
      </span>
    ),
  },
  pruefung: {
    actionname: "protokollMauerlaschePruefung",
    title: "Prüfung",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faBinoculars}></FontAwesomeIcon>
        <FontAwesomeIcon
          icon={faCheckCircle}
          transform='shrink-9 right-12 down-5'
        ></FontAwesomeIcon>
      </span>
    ),
  },
  schaltstellerevision: {
    actionname: "protokollSchaltstelleRevision",
    title: "Revision",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faCalendarAlt}></FontAwesomeIcon>
        <FontAwesomeIcon
          icon={faCheckCircle}
          transform='shrink-9 right-11 down-5'
        ></FontAwesomeIcon>
      </span>
    ),
  },
  sonstiges: {
    actionname: "protokollFortfuehrungsantrag",
    title: "Sonstiges",
    icon: (
      <span className='fa-layers fa-fw'>
        <FontAwesomeIcon icon={faStream}></FontAwesomeIcon>
        <FontAwesomeIcon icon={faPlus} transform='shrink-9 right-12 up-0'></FontAwesomeIcon>
      </span>
    ),
  },
};

export const addIncidentActionIcons = {
  veranlassung: (
    <span className='fa-layers fa-fw'>
      <FontAwesomeIcon icon={faInbox}></FontAwesomeIcon>
    </span>
  ),
  einzelauftrag: (
    <span className='fa-layers fa-fw'>
      <FontAwesomeIcon icon={faFileInvoice}></FontAwesomeIcon>
      <FontAwesomeIcon icon={faAsterisk} transform='shrink-9 right-11 up-5' />
    </span>
  ),
  add2arbeitsauftrag: (
    <span className='fa-layers fa-fw'>
      <FontAwesomeIcon icon={faFileInvoice}></FontAwesomeIcon>
      <FontAwesomeIcon icon={faPlus} transform='shrink-9 right-10 up-5' />
    </span>
  ),
  veranlassung_leuchte: (
    <span className='fa-layers fa-fw'>
      <FontAwesomeIcon icon={faInbox}></FontAwesomeIcon>
      <FontAwesomeIcon
        icon={faFilter}
        transform='rotate-180 down-5 shrink-6 right-13'
      ></FontAwesomeIcon>
    </span>
  ),
  einzelauftrag_leuchte: (
    <span className='fa-layers fa-fw'>
      <FontAwesomeIcon icon={faFileInvoice}></FontAwesomeIcon>
      <FontAwesomeIcon icon={faAsterisk} transform='shrink-9 right-11 up-5' />
      <FontAwesomeIcon
        icon={faFilter}
        transform='rotate-180 down-5 shrink-6 right-13'
      ></FontAwesomeIcon>
    </span>
  ),
  add2arbeitsauftrag_leuchte: (
    <span className='fa-layers fa-fw'>
      <FontAwesomeIcon icon={faFileInvoice}></FontAwesomeIcon>
      <FontAwesomeIcon icon={faPlus} transform='shrink-9 right-10 up-5' />
      <FontAwesomeIcon
        icon={faFilter}
        transform='rotate-180 down-5 shrink-6 right-13'
      ></FontAwesomeIcon>
    </span>
  ),
  veranlassung_mast: (
    <span className='fa-layers fa-fw'>
      <FontAwesomeIcon
        icon={faBatteryEmpty}
        transform='rotate-90 down-5 shrink-7 right-13'
      ></FontAwesomeIcon>
      <FontAwesomeIcon icon={faInbox}></FontAwesomeIcon>
    </span>
  ),
  einzelauftrag_mast: (
    <span className='fa-layers fa-fw'>
      <FontAwesomeIcon icon={faFileInvoice}></FontAwesomeIcon>
      <FontAwesomeIcon icon={faAsterisk} transform='shrink-9 right-11 up-5' />
      <FontAwesomeIcon
        icon={faBatteryEmpty}
        transform='rotate-90 down-5 shrink-7 right-13'
      ></FontAwesomeIcon>
    </span>
  ),
  add2arbeitsauftrag_mast: (
    <span className='fa-layers fa-fw'>
      <FontAwesomeIcon icon={faFileInvoice}></FontAwesomeIcon>
      <FontAwesomeIcon icon={faPlus} transform='shrink-9 right-10 up-5' />
      <FontAwesomeIcon
        icon={faBatteryEmpty}
        transform='rotate-90 down-5 shrink-7 right-13'
      ></FontAwesomeIcon>
    </span>
  ),
};
