import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import { message } from "antd";
import type { AppDispatch } from "../../store";
import {
  getKeyTablesFetched,
  getKeyTablesData,
  setKeyTablesData,
  setKeyTablesErrors,
  setKeyTablesLoading,
} from "../../store/slices/keyTables";
import {
  getSelectedTeamId,
  getPreviousTeamId,
  getDraftMode,
  setSelectedTeamId,
  setPreviousTeamId,
} from "../../store/slices/arbeitsauftraege";
import { fetchAllKeyTables } from "../../helper/apiMethods";

interface BelisDataProviderProps {
  jwt: string | undefined;
  children: ReactNode;
}

const BelisDataProvider = ({ jwt, children }: BelisDataProviderProps) => {
  const dispatch: AppDispatch = useDispatch();
  const keyTablesFetched = useSelector(getKeyTablesFetched);
  const keyTablesData = useSelector(getKeyTablesData);
  const selectedTeamId = useSelector(getSelectedTeamId);
  const previousTeamId = useSelector(getPreviousTeamId);
  const draftMode = useSelector(getDraftMode);
  const initialSetupDone = useRef(false);

  useEffect(() => {
    if (keyTablesFetched || !jwt) return;

    const fetchData = async () => {
      dispatch(setKeyTablesLoading(true));
      try {
        const { data, errors } = await fetchAllKeyTables(jwt);
        dispatch(setKeyTablesData(data));
        dispatch(setKeyTablesErrors(errors));
        if (Object.keys(errors).length > 0) {
          message.error(
            "Einige Schlüsseltabellen konnten nicht geladen werden"
          );
        }
      } catch (error) {
        console.error("Failed to fetch key tables:", error);
      } finally {
        dispatch(setKeyTablesLoading(false));
      }
    };
    fetchData();
  }, [jwt, keyTablesFetched, dispatch]);

  // Recovery from app restart during draft mode + default team on first load
  useEffect(() => {
    if (!keyTablesFetched || initialSetupDone.current) return;

    // App was closed during draft mode (draftMode resets to false on restart,
    // but previousTeamId is still persisted): restore previous team
    if (!draftMode && previousTeamId != null && selectedTeamId == null) {
      dispatch(setSelectedTeamId(previousTeamId));
      dispatch(setPreviousTeamId(null));
      initialSetupDone.current = true;
      return;
    }

    // First-ever load: default to "Störungsbeseitigung"
    if (selectedTeamId == null && previousTeamId == null) {
      const teams = (keyTablesData.teams || []) as {
        id: number;
        name?: string;
      }[];
      const defaultTeam = teams.find(
        (t) => t.name === "Störungsbeseitigung"
      );
      if (defaultTeam) {
        dispatch(setSelectedTeamId(defaultTeam.id));
      }
    }

    initialSetupDone.current = true;
  }, [keyTablesFetched, selectedTeamId, previousTeamId, draftMode, keyTablesData.teams, dispatch]);

  return <>{children}</>;
};

export default BelisDataProvider;
