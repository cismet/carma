import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import {
  getSelectedFlur,
  getSelectedFlurstueckLabel,
  getSelectedGemarkung,
} from "../store/slices/lagis";
import { removeLeadingZeros, replaceSlashWithDash } from "../core/tools/helper";

const useUrlSyncGemarkunFlurFlurstueckHook = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedGemarkung = useSelector(getSelectedGemarkung);
  const selectedFlur = useSelector(getSelectedFlur);
  const selectedFlurstueckLabel = useSelector(getSelectedFlurstueckLabel);

  useEffect(() => {
    // Create a new URLSearchParams object to avoid direct mutation
    const newSearchParams = new URLSearchParams(searchParams);

    // Update the search parameters based on the Redux state

    if (selectedGemarkung) {
      newSearchParams.set("gem", selectedGemarkung.gemarkung);
    } else {
      newSearchParams.delete("gem");
    }

    if (selectedFlur) {
      newSearchParams.set("flur", removeLeadingZeros(selectedFlur.flur, true));
    } else {
      newSearchParams.delete("flur");
    }

    if (selectedFlurstueckLabel) {
      newSearchParams.set(
        "fstck",
        replaceSlashWithDash(removeLeadingZeros(selectedFlurstueckLabel))
      );
    } else {
      newSearchParams.delete("fstck");
    }

    // Update the URL search parameters
    setSearchParams(newSearchParams);
  }, [
    selectedGemarkung,
    selectedFlur,
    selectedFlurstueckLabel,
    searchParams,
    setSearchParams,
  ]);
};

export default useUrlSyncGemarkunFlurFlurstueckHook;
