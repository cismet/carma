import { createSlice } from "@reduxjs/toolkit";
import queries from "../../core/queries/online";
import { fetchGraphQL, fetchGraphQLFromWuNDa } from "../../core/graphql";
import { storeGeometry, switchToLandparcel } from "./lagis";
import { getGemarkunFlurFstckFromAlkisId } from "../../core/tools/helper";

const initialState = {
  contractFlurstucke: undefined,
  mipaFlurstucke: undefined,
  loading: false,
};

const slice = createSlice({
  name: "search",
  initialState,
  reducers: {
    storeContractFlurstucke(state, action) {
      state.contractFlurstucke = action.payload;
      return state;
    },
    storeMipaFlurstucke(state, action) {
      state.mipaFlurstucke = action.payload;
      return state;
    },
    storeLoading(state, action) {
      state.loading = action.payload;
      return state;
    },
  },
});

export default slice;

export const getFlurstuckeByContractAndMipa = async (
  searchValue,
  dispatch,
  jwt,
  navigate
) => {
  if (searchValue === "") {
    dispatch(storeContractFlurstucke(undefined));
    dispatch(storeMipaFlurstucke(undefined));
    return false;
  }
  dispatch(storeContractFlurstucke(undefined));
  dispatch(storeMipaFlurstucke(undefined));
  dispatch(storeLoading(true));
  await getFlurstuckeByFileNumberHandle(searchValue, dispatch, jwt, navigate);
  await getFlurstuckelByMipaFileNumberHandle(
    searchValue,
    dispatch,
    jwt,
    navigate
  );
  dispatch(storeLoading(false));
};

const getFlurstuckeByFileNumberHandle = async (
  searchValue,
  dispatch,
  jwt,
  navigate
) => {
  const aktz = `%${searchValue}%`;
  const result = await fetchGraphQL(
    queries.getFlurstuckelByContractFileNumber,
    {
      aktz,
    },
    jwt
  );
  if (result.status === 401) {
    return navigate("/login");
  }

  if (result?.data?.flurstueck) {
    dispatch(storeContractFlurstucke(result.data.flurstueck));
  }
};

const getFlurstuckelByMipaFileNumberHandle = async (
  searchValue,
  dispatch,
  jwt,
  navigate
) => {
  const aktz = `%${searchValue}%`;
  const result = await fetchGraphQL(
    queries.getFlurstuckelByMipaFileNumber,
    {
      aktz,
    },
    jwt
  );
  if (result.status === 401) {
    return navigate("/login");
  }
  if (result?.data?.view_mipa_by_aktenzeichen) {
    dispatch(storeMipaFlurstucke(result.data.view_mipa_by_aktenzeichen));
  }
};

export const { storeContractFlurstucke, storeMipaFlurstucke, storeLoading } =
  slice.actions;

export const getContractFlurstucke = (state) => {
  return state.search.contractFlurstucke;
};
export const getMipaFlurstucke = (state) => {
  return state.search.mipaFlurstucke;
};
export const getLoading = (state) => {
  return state.search.loading;
};

export const getFstckForPoint = (x, y, done) => {
  return async (dispatch, getState) => {
    const jwt = getState().auth.jwt;
    try {
      const result = await fetchGraphQLFromWuNDa(
        queries.getFstckForPoint,
        { x, y },
        jwt
      );
      const geom = result?.data?.flurstueck[0].geom.geo_field;
      const payload = {
        ...getGemarkunFlurFstckFromAlkisId(
          result?.data?.flurstueck[0].alkis_id
        ),
        flurstueckChoosen: done,
        akis_id: result?.data?.flurstueck[0].alkis_id,
      };
      dispatch(storeGeometry(geom));
      dispatch(switchToLandparcel(payload));
    } catch (e) {
      console.log("error in getFstckForPoint", e);
      done();
    }
  };
};
