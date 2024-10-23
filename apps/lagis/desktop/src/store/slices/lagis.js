import { createSlice } from "@reduxjs/toolkit";
import { fetchGraphQL, fetchGraphQLFromWuNDa } from "../../core/graphql";
import queries from "../../core/queries/online";
import { getBuffer25832 } from "../../core/tools/mappingTools";
import {
  getGemarkunFlurFstckFromAlkisId,
  getLandparcelStringFromAlkisLandparcel,
} from "../../core/tools/helper";
const initialState = {
  lagisLandparcel: undefined,
  alkisLandparcel: undefined,
  rebe: undefined,
  mipa: undefined,
  history: undefined,
  historieHalten: undefined,
  historieHaltenRootText: undefined,
  geometry: undefined,
  selectedGemarkung: undefined,
  selectedFlur: undefined,
  selectedFlurstueckLabel: undefined,
  landparcelInternaDataStructure: undefined,
};

const slice = createSlice({
  name: "lagis",
  initialState,
  reducers: {
    storeLagisLandparcel(state, action) {
      state.lagisLandparcel = action.payload;
      return state;
    },
    storeAlkisLandparcel(state, action) {
      state.alkisLandparcel = action.payload;
      return state;
    },
    storeRebe(state, action) {
      state.rebe = action.payload;
      return state;
    },
    storeMipa(state, action) {
      state.mipa = action.payload;
      return state;
    },
    storeHistory(state, action) {
      state.history = action.payload;
      return state;
    },
    storeGeometry(state, action) {
      state.geometry = action.payload;
      return state;
    },
    storeHistorieHalten(state, action) {
      state.historieHalten = action.payload;
      return state;
    },
    storeHistorieHaltenRootText(state, action) {
      state.historieHaltenRootText = action.payload;
      return state;
    },
    storeSelectedGemarkung(state, action) {
      state.selectedGemarkung = action.payload;
      return state;
    },
    storeSelectedFlur(state, action) {
      state.selectedFlur = action.payload;
      return state;
    },
    storeSelectedFlurstueckLabel(state, action) {
      state.selectedFlurstueckLabel = action.payload;
      return state;
    },
    storeLandparcelInternaDataStructur(state, action) {
      state.landparcelInternaDataStructure = action.payload;
      return state;
    },
  },
});

export default slice;
export const fetchFlurstueck = (schluessel_id, alkis_id, navigate) => {
  return async (dispatch, getState) => {
    const jwt = getState().auth.jwt;
    if (jwt) {
      const result = await fetchGraphQL(
        queries.getLagisLandparcelByFlurstueckSchluesselId,
        {
          schluessel_id,
          alkis_id,
        },
        jwt
      );

      if (result.status === 401) {
        return navigate("/login");
      }

      const f = result?.data.flurstueck[0];
      f.alkisLandparcel = result?.data.extended_alkis_flurstueck[0];

      dispatch(storeLagisLandparcel(f));
      dispatch(storeAlkisLandparcel(f.alkisLandparcel));

      let geo =
        result?.data.flurstueck[0].extended_geom?.geo_field ||
        result?.data.flurstueck[0].alkisLandparcel?.geometrie;

      if (!geo) {
        const resultGeo = await getGeomFromWuNDa(alkis_id, jwt, navigate);
        geo = resultGeo.data.flurstueck[0].extended_geom.geo_field;
      }
      dispatch(storeGeometry(geo));

      if (geo) {
        await fetchRebe(getBuffer25832(geo, -1), jwt, dispatch);
        await fetchMipa(getBuffer25832(geo, -1), jwt, dispatch);
      } else {
        dispatch(storeRebe());
        dispatch(storeMipa());
      }

      await fetchHistory(schluessel_id, jwt, dispatch);
    }
  };
};

export const getGeomFromWuNDa = async (alkis_id, jwt, navigate) => {
  const result = await fetchGraphQLFromWuNDa(
    queries.getGeomFromWuNDA,
    {
      alkis_id,
    },
    jwt
  );
  if (result.status === 401) {
    return navigate("/login");
  }
  return result;
};

export const fetchHistory = async (sid, jwt, dispatch, navigate) => {
  try {
    const result = await fetchGraphQL(
      queries.history,
      {
        schluessel_id: sid,
      },
      jwt
    );
    if (result.status === 401) {
      return navigate("/login");
    }
    dispatch(storeHistory(result?.data?.cs_calc_history));
  } catch (e) {
    console.log("xxx error in getHistory", e);
  }
};

const fetchRebe = async (geo, jwt, dispatch, navigate) => {
  const result = await fetchGraphQL(
    queries.getRebeByGeo,
    {
      geo,
    },
    jwt
  );
  if (result.status === 401) {
    return navigate("/login");
  }
  dispatch(storeRebe(result?.data?.rebe));
};
const fetchMipa = async (geo, jwt, dispatch, navigate) => {
  const result = await fetchGraphQL(
    queries.getMipaByGeo,
    {
      geo,
    },
    jwt
  );
  if (result.status === 401) {
    return navigate("/login");
  }
  dispatch(storeMipa(result?.data?.mipa));
};

export const fetchContractById = async (vertag_id, jwt, landparcel) => {
  console.log("fetchContractById");
  const result = await fetchGraphQL(
    queries.getQuerverweiseByVertragId,
    {
      vertag_id,
    },
    jwt
  );
  if (result.data?.flurstueck) {
    const currentLandparcel =
      getLandparcelStringFromAlkisLandparcel(landparcel);
    const landparcelsArr = [];
    const data = result.data?.flurstueck.forEach((f) => {
      const flur = f.flurstueck_schluessel.flur;
      const zaehler = f.flurstueck_schluessel.flurstueck_zaehler;
      const nenner = f.flurstueck_schluessel.flurstueck_nenner;
      const gemarkung = f.flurstueck_schluessel.gemarkung.bezeichnung;
      const crossReference = `${gemarkung} ${flur} ${zaehler}/${nenner}`;
      if (crossReference !== currentLandparcel) {
        landparcelsArr.push(crossReference);
      }
    });

    return landparcelsArr;
  } else {
    [];
  }
};

export const {
  storeLagisLandparcel,
  storeAlkisLandparcel,
  storeRebe,
  storeMipa,
  storeHistory,
  storeGeometry,
  storeHistorieHalten,
  storeHistorieHaltenRootText,
  storeSelectedGemarkung,
  storeSelectedFlur,
  storeSelectedFlurstueckLabel,
  storeLandparcelInternaDataStructur,
} = slice.actions;

export const getLandparcel = (state) => {
  return state.lagis.lagisLandparcel;
};
export const getAlkisLandparcel = (state) => {
  return state.lagis.alkisLandparcel;
};
export const getMipa = (state) => {
  return state.lagis.mipa;
};
export const getRebe = (state) => {
  return state.lagis.rebe;
};
export const getHistory = (state) => {
  return state.lagis.history;
};
export const getGeometry = (state) => {
  return state.lagis.geometry;
};

export const getSelectedGemarkung = (state) => {
  return state.lagis.selectedGemarkung;
};
export const getSelectedFlur = (state) => {
  return state.lagis.selectedFlur;
};
export const getSelectedFlurstueckLabel = (state) => {
  return state.lagis.selectedFlurstueckLabel;
};
export const getLandparcelInternaDataStructure = (state) => {
  return state.lagis.landparcelInternaDataStructure;
};

export const getOffices = (state) => {
  const offices =
    state.lagis.lagisLandparcel?.verwaltungsbereiche_eintragArrayRelationShip ||
    [];
  if (
    offices.length > 0 &&
    offices[0]?.verwaltungsbereichArrayRelationShip.length === 0
  ) {
    return [];
  }
  return offices;
};

export const getHistorieHalten = (state) => {
  return state.lagis.historieHalten;
};

export const getHistorieHaltenRootText = (state) => {
  return state.lagis.historieHaltenRootText;
};

export const getAdditionalRollen = (state) => {
  return state.lagis?.lagisLandparcel?.zusatz_rolleArrayRelationShip || [];
};

export const getStreetFronts = (state) => {
  return state.lagis?.lagisLandparcel?.strassenfrontArrayRelationShip || [];
};

export const getUsage = (state) => {
  return state.lagis.lagisLandparcel?.nutzungArrayRelationShip || undefined;
};
export const getCountOfUsage = (state) => {
  const allUsages =
    state.lagis.lagisLandparcel?.nutzungArrayRelationShip || undefined;
  if (allUsages) {
    const numberOfUsages = allUsages.length || 0;
    let counter = 0;
    if (numberOfUsages !== 0) {
      allUsages?.forEach((u, idx) => {
        u.nutzung_buchungArrayRelationShip.forEach((item, idx) => {
          if (item.gueltig_bis === null) {
            counter++;
          }
        });
      });

      return counter;
    }
  } else {
    return undefined;
  }
};
export const getContract = (state) => {
  return state.lagis.lagisLandparcel?.ar_vertraegeArray || undefined;
};
export const getTransaction = (state) => {
  return (
    state.lagis.lagisLandparcel?.kassenzeichenArrayRelationShip || undefined
  );
};
export const getDms = (state) => {
  return state.lagis.lagisLandparcel?.dms_urlArrayRelationShip || undefined;
};

export const getAdditionalRoll = (state) => {
  if (
    state.lagis &&
    state.lagis.lagisLandparcel[0]?.zusatz_rolleArrayRelationShip
  ) {
    return state.lagis.lagisLandparcel[0].zusatz_rolleArrayRelationShip;
  }
  return state.lagis.lagisLandparcel;
};
export const getAgenciesRoll = (state) => {
  if (
    state.lagis &&
    state.lagis.lagisLandparcel[0]
      ?.verwaltungsbereiche_eintragArrayRelationShip[0]
      .verwaltungsbereichArrayRelationShip[0]
  ) {
    return state.lagis.lagisLandparcel[0]
      ?.verwaltungsbereiche_eintragArrayRelationShip[0]
      .verwaltungsbereichArrayRelationShip[0];
  }
  return undefined;
};

export const getUrlLandparcelParams = (state) => {
  const alkisId = state.lagis?.alkisLandparcel?.alkis_id;
  // const schluesselId = state.lagis.lagisLandparcel.id;
  if (alkisId) {
    return {
      alkisId: alkisId,
      // schluesselId: schluesselId,
    };
  }
  return state.lagis.alkisLandparcel;
};

function padWithZeros(num, length) {
  return String(num).padStart(length, "0");
}

const getGemarkungByName = (name, landparcelInternaDataStructure) => {
  const result = Object.keys(landparcelInternaDataStructure).find((key) => {
    return landparcelInternaDataStructure[key].gemarkung === name;
  });
  if (result) {
    return landparcelInternaDataStructure[result];
  }
};

export const switchToLandparcel = ({
  gem,
  gemId,
  flur,
  fstck,
  flurstueckChoosen = () => {},
}) => {
  return async (dispatch, getState) => {
    const landparcelInternaDataStructure =
      getState().lagis.landparcelInternaDataStructure;

    let _gem;
    if (!gem) {
      _gem = landparcelInternaDataStructure[gemId].gemarkung;
    } else {
      _gem = gem;
    }
    const selectedGemarkung = getState().lagis.selectedGemarkung;
    if (_gem && flur && fstck) {
      const fullGemarkung = getGemarkungByName(
        _gem,
        landparcelInternaDataStructure
      );
      dispatch(storeSelectedGemarkung(fullGemarkung));
      const fullFlur = fullGemarkung.flure[padWithZeros(flur, 3)];
      dispatch(storeSelectedFlur(fullFlur));

      //check whether fstck is conatining a dash
      const splitted = fstck.split("-");
      let fstckLabel;
      let pureLabel;
      if (splitted.length === 2 && splitted[1] !== "0") {
        fstckLabel =
          padWithZeros(splitted[0], 5) + "/" + padWithZeros(splitted[1], 4);
      } else {
        fstckLabel = padWithZeros(splitted[0], 5);
        // pureLabel = fstck;
      }
      const x = {
        gemarkung: fullGemarkung.gemarkung,
        flur: fullFlur.flur,
        label: fstckLabel, //this needs to be added because of a non city owned fstck
        ...fullFlur.flurstuecke[fstckLabel],
      };

      // if (fullGemarkung && fullFlur && fullFlur.flurstuecke[fstckLabel]) {
      //dispatch(storeSelectedFlurstueckLabel(fstckLabel));
      // flurstueckChoosen(x);
      // } else {
      //dispatch(storeSelectedFlurstueckLabel());
      // }
      flurstueckChoosen(x);
      dispatch(storeSelectedFlurstueckLabel(fstckLabel));
    } else if (_gem && flur) {
      const fullGemarkung = getGemarkungByName(
        _gem,
        landparcelInternaDataStructure
      );
      dispatch(storeSelectedGemarkung(fullGemarkung));
      const fullFlur = fullGemarkung.flure[padWithZeros(flur, 3)];
      dispatch(storeSelectedFlur(fullFlur));
      fullFlur;
      dispatch(storeSelectedFlurstueckLabel());
      dispatch(storeAlkisLandparcel(undefined));
      dispatch(storeLagisLandparcel(undefined));
      dispatch(storeRebe(undefined));
      dispatch(storeMipa(undefined));
    } else if (_gem || selectedGemarkung) {
      if (_gem || selectedGemarkung) {
        const fullGemarkung = getGemarkungByName(
          _gem,
          landparcelInternaDataStructure
        );
        dispatch(storeSelectedGemarkung(fullGemarkung));
        dispatch(storeSelectedFlur());
        dispatch(storeSelectedFlurstueckLabel());
        dispatch(storeAlkisLandparcel(undefined));
        dispatch(storeLagisLandparcel(undefined));
        dispatch(storeRebe(undefined));
        dispatch(storeMipa(undefined));
      }
    }
  };
};

export const buildLandparcelInternalDataStructure = (all, gemarkungen) => {
  return async (dispatch, getState) => {
    dispatch(storeLandparcelInternaDataStructur(buildData(all, gemarkungen)));
  };
};

const buildData = (xx, gemarkungen) => {
  const gemarkungLookup = {};
  for (const g of gemarkungen) {
    gemarkungLookup[g.schluessel] = g.bezeichnung;
  }
  const result = {};
  for (const f of xx) {
    const gff = getGemarkunFlurFstckFromAlkisId(f.alkis_id);
    const gemarkung = gff.gemId;
    const flur = gff.flur;
    const flurstueck = gff.fstck;
    // const splitted = f.alkis_id.split("-");
    // const gemarkung = splitted[0].substring(2);
    // const flur = splitted[1];
    // const flurstueck = splitted[2];
    if (result[gemarkung]) {
      if (result[gemarkung].flure[flur]) {
        result[gemarkung].flure[flur].flurstuecke[flurstueck] = {
          label: flurstueck,
          lfk: f.schluessel_id,
          art: f.flurstueckart || -1,
          alkis_id: f.alkis_id,
          hist: f.historisch,
        };
      } else {
        result[gemarkung].flure[flur] = {
          flur: flur,
          flurstuecke: {},
        };
        result[gemarkung].flure[flur].flurstuecke[flurstueck] = {
          label: flurstueck,
          lfk: f.schluessel_id,
          art: f.flurstueckart || -1,
          alkis_id: f.alkis_id,
          hist: f.historisch,
        };
      }
    } else {
      result[gemarkung] = {
        gemarkung: gemarkungLookup[gemarkung] || gemarkung,
        flure: {},
      };
      result[gemarkung].flure[flur] = {
        flur: flur,
        flurstuecke: {},
      };
      result[gemarkung].flure[flur].flurstuecke[flurstueck] = {
        label: flurstueck,
        lfk: f.schluessel_id,
        art: f.flurstueckart || -1,
        alkis_id: f.alkis_id,
        hist: f.historisch,
      };
    }
  }
  return result;
};
