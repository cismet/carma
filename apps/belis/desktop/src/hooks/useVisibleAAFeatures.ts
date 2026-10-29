import { useMemo } from "react";
import { useSelector } from "react-redux";
import {
  getAAFeatures,
  getDraftMode,
} from "../store/slices/arbeitsauftraege";
import {
  getAllAADrafts,
  getAAIdsWithAPDrafts,
} from "../store/slices/arbeitsauftraegeDrafts";
import { getSelectedTeamName } from "../store/selectors";
import { sortAAFeatures, AA_DEFAULT_SORT } from "../helper/aaSortHelpers";
import type { AASortConfig } from "../helper/aaSortHelpers";

// The AAs shown in the sidebar list: filtered by team, and in draft mode only
// those with AA or AP drafts.
export const useVisibleAAFeatures = (sort?: AASortConfig) => {
  const allFeatures = useSelector(getAAFeatures);
  const draftMode = useSelector(getDraftMode);
  const aaDrafts = useSelector(getAllAADrafts);
  const aaIdsWithAPDrafts = useSelector(getAAIdsWithAPDrafts);
  const selectedTeamName = useSelector(getSelectedTeamName);

  return useMemo(() => {
    let filtered = selectedTeamName
      ? allFeatures.filter((f) => f.team === selectedTeamName)
      : allFeatures;

    if (draftMode) {
      const draftIdSet = new Set(Object.keys(aaDrafts).map(Number));
      for (const aaId of aaIdsWithAPDrafts) {
        draftIdSet.add(Number(aaId));
      }
      filtered = filtered.filter((f) => draftIdSet.has(f.id));
    }

    return sortAAFeatures(filtered, sort ?? AA_DEFAULT_SORT);
  }, [allFeatures, selectedTeamName, draftMode, aaDrafts, aaIdsWithAPDrafts, sort]);
};
