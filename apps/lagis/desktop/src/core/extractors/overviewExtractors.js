import { defaultLinksColor } from "../tools/helper";
import {
  getOfficesWithColorAndSquare,
  geHistoricalArraytOfficesWithColorAndSquare,
} from "../tools/helper";
export function mipaExtractor({ mipa, landparcel }) {
  if (mipa === undefined && landparcel === undefined) {
    return {
      numberOfRents: " ",
      color: defaultLinksColor,
    };
  } else {
    const numberOfRents = mipa?.length || 0;
    return {
      numberOfRents,
      color: numberOfRents > 0 ? "#5D5FEF" : defaultLinksColor,
    };
  }
}
export function historyExtractor(dataIn) {
  if (dataIn === undefined) {
    return undefined;
  } else {
    if (dataIn.length === 0) {
      return 0;
    }
    return dataIn.length;
  }
}

export function officesExtractor(dataIn) {
  if (dataIn === undefined) {
    return { currentOffices: [], history: 0 };
  } else {
    const landparcel = dataIn;
    const officesData =
      landparcel?.verwaltungsbereiche_eintragArrayRelationShip || [];
    const lastOffice = officesData[officesData.length - 1];
    const history = officesData.slice(0, officesData.length - 1);
    const historyData = geHistoricalArraytOfficesWithColorAndSquare(
      history,
      dataIn
    );
    const nameGeomColorData = getOfficesWithColorAndSquare(lastOffice, dataIn);

    return { currentOffices: nameGeomColorData, history: historyData.length };
  }
}
export function transactionExtractor(dataIn) {
  if (dataIn === undefined) {
    return {
      numberOfDocuments: "  ",
      color: defaultLinksColor,
    };
  } else {
    const landparcel = dataIn;
    const numberOfDocuments =
      landparcel?.kassenzeichenArrayRelationShip?.length || 0;
    return {
      numberOfDocuments,
      color: numberOfDocuments > 0 ? "#5D5FEF" : defaultLinksColor,
    };
  }
}
export function operationExtractor(dataIn) {
  if (dataIn === undefined) {
    return {
      numberOfOperations: "  ",
      color: defaultLinksColor,
    };
  } else {
    const landparcel = dataIn;
    const numberOfOperations = landparcel?.ar_vertraegeArray?.length || 0;
    return {
      numberOfOperations,
      color: numberOfOperations > 0 ? "#389EFD" : defaultLinksColor,
    };
  }
}

export function usageExtractor(dataIn) {
  if (dataIn === undefined) {
    return {
      numberOfUsages: "  ",
      color: defaultLinksColor,
    };
  } else {
    const landparcel = dataIn;
    const numberOfUsages = landparcel?.nutzungArrayRelationShip?.length || 0;
    let counter = 0;
    if (numberOfUsages !== 0) {
      landparcel?.nutzungArrayRelationShip?.forEach((u, idx) => {
        u.nutzung_buchungArrayRelationShip.forEach((item, idx) => {
          if (item.gueltig_bis === null) {
            counter++;
          }
        });
      });
    }
    return {
      numberOfUsages: counter,
      color: counter > 0 ? "#F31630" : defaultLinksColor,
    };
  }
}

export function dmsExtractor(dataIn) {
  if (dataIn === undefined) {
    return {
      numberOfDocuments: "  ",
      color: defaultLinksColor,
    };
  } else {
    const landparcel = dataIn;
    const numberOfDocuments = landparcel?.dms_urlArrayRelationShip?.length || 0;
    return {
      numberOfDocuments,
      color: numberOfDocuments > 0 ? "#180E53" : defaultLinksColor,
    };
  }
}

export function rebeExtractor({ rebe, landparcel }) {
  if (rebe === undefined && landparcel === undefined) {
    return {
      numberOfRights: "  ",
      color: defaultLinksColor,
    };
  } else {
    const numberOfRights = rebe?.length || 0;
    return {
      numberOfRights,
      color: numberOfRights > 0 ? "#180E53" : defaultLinksColor,
    };
  }
}
