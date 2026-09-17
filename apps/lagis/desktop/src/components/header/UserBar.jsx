import UserName from "./UserName";
import { Tooltip } from "antd";
import { LogoutOutlined, PartitionOutlined } from "@ant-design/icons";
import { getLogin, storeJWT, storeLogin } from "../../store/slices/auth";
import {
  storeLandParcels,
  storeLandmarks,
  getLandParcels,
  getLandmarks,
} from "../../store/slices/landParcels";
import {
  storeLagisLandparcel,
  storeAlkisLandparcel,
  storeRebe,
  storeMipa,
  storeHistory,
  fetchFlurstueck,
  getLandparcelInternaDataStructure,
  buildLandparcelInternalDataStructure,
  switchToLandparcel,
} from "../../store/slices/lagis";
import { setHasFittedBounds } from "../../store/slices/mapping";
import {
  getSyncLandparcel,
  setFetchLandParcelError,
} from "../../store/slices/ui";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { removeLeadingZeros } from "../../core/tools/helper";
import { LandParcelSearch } from "@carma-mapping/fuzzy-search";
import LandParcelHistoryNav from "../navigation/lp-history/LandParcelHistoryNav";
import LandParcelWizard from "../wizard/LandParcelWizard";
import {
  getCurrentLParcelNav,
  setCurrentLP,
} from "../../store/slices/lpHistoryNav";

// The wizard's GraphQL tab. undefined follows the default (URL ?showRaw, else
// localhost only); set it to false to switch the tab off, true to force it on.
const WIZARD_SHOW_GRAPHQL = undefined;

const UserBar = () => {
  const dispatch = useDispatch();
  const userLogin = useSelector(getLogin);
  const syncLandparcel = useSelector(getSyncLandparcel);
  const navigate = useNavigate();
  const [urlParams, setUrlParams] = useSearchParams();
  const { landParcels } = useSelector(getLandParcels);
  const { landmarks } = useSelector(getLandmarks);
  const landparcelInternaDataStructure = useSelector(
    getLandparcelInternaDataStructure
  );
  const currentLParcelNav = useSelector(getCurrentLParcelNav);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Build display string from URL params for the search input
  const urlGem = urlParams.get("gem");
  const urlFlur = urlParams.get("flur");
  const urlFstck = urlParams.get("fstck");
  const searchDefaultValue =
    urlGem && urlFlur && urlFstck
      ? `${urlGem}-${removeLeadingZeros(urlFlur, true)}-${removeLeadingZeros(
          urlFstck.replace("-", "/")
        )}`
      : undefined;

  useEffect(() => {
    if (landParcels && landParcels.length > 1) {
      dispatch(
        buildLandparcelInternalDataStructure(landParcels, landmarks || [])
      );
    }
  }, [landParcels, landmarks]);

  // React to URL param changes (from LandParcelHistoryNav or direct URL navigation)
  useEffect(() => {
    if (!landparcelInternaDataStructure) return;

    const gem = urlParams.get("gem") || undefined;
    const flur = urlParams.get("flur") || undefined;
    const fstck = urlParams.get("fstck") || undefined;

    if (gem && flur && fstck) {
      const fullFstckLabel =
        gem +
        " " +
        removeLeadingZeros(flur, true) +
        " " +
        removeLeadingZeros(fstck.replace("-", "/"));
      if (fullFstckLabel !== currentLParcelNav) {
        dispatch(setCurrentLP(fullFstckLabel));
      }

      dispatch(storeLagisLandparcel(undefined));
      dispatch(storeAlkisLandparcel(undefined));
      dispatch(storeRebe(undefined));
      dispatch(storeMipa(undefined));
      dispatch(storeHistory(undefined));

      dispatch(
        switchToLandparcel({
          gem,
          flur,
          fstck,
          flurstueckChoosen: (resolvedFstck) => {
            if (resolvedFstck.lfk) {
              dispatch(
                fetchFlurstueck(
                  resolvedFstck.lfk,
                  resolvedFstck.alkis_id,
                  navigate,
                  () => dispatch(setFetchLandParcelError(true))
                )
              );
              handleOpenLandparcelInJavaApp(resolvedFstck);
            }
          },
        })
      );
      setTimeout(() => {
        dispatch(setHasFittedBounds(false));
      }, 800);
    }
  }, [urlParams, landparcelInternaDataStructure]);

  const handleOpenLandparcelInJavaApp = (fstck) => {
    if (syncLandparcel) {
      const gemarkung = fstck.gemarkung;
      const flur = removeLeadingZeros(fstck.flur, true);
      const fstckArr = removeLeadingZeros(fstck.label).split("/");
      const zaehler = fstckArr[0];
      const nenner = fstckArr[1];
      fetch(
        `http://localhost:19000/loadFlurstueck?gemarkung=${gemarkung}&flur=${flur}&zaehler=${zaehler}&nenner=${nenner}`
      ).catch((error) => {
        //  i expect an error here
      });
    }
  };
  return (
    <div className="flex items-center">
      <div className="mr-3">
        <LandParcelHistoryNav />
      </div>
      <LandParcelSearch
        pixelwidth={400}
        landParcelData={landparcelInternaDataStructure}
        defaultValue={searchDefaultValue}
        onParcelChange={(info) => {
          if (!info) return;
          setUrlParams({
            gem: info.gemarkung,
            flur: info.flur,
            fstck: info.fstck.replace("/", "-"),
          });
        }}
        showDropdownBelow={true}
        showButton={false}
      />
      <div className="ml-auto flex gap-1 items-center">
        <Tooltip title="Flurstücksassistent öffnen" placement="bottom">
          <PartitionOutlined
            className="text-sm cursor-pointer"
            style={{ paddingRight: "12px" }}
            onClick={() => setWizardOpen(true)}
            data-test-id="open-landparcel-wizard"
          />
        </Tooltip>
        <div className="logout ml-auto pl-1 flex items-center">
          <Tooltip title="Ausloggen" placement="right">
            <LogoutOutlined
              className="text-sm cursor-pointer"
              style={{ paddingRight: "12px" }}
              onClick={() => {
                dispatch(storeAlkisLandparcel(undefined));
                dispatch(storeLagisLandparcel(undefined));
                dispatch(storeRebe(undefined));
                dispatch(storeMipa(undefined));
                dispatch(storeJWT(undefined));
                dispatch(storeLogin(undefined));
                dispatch(storeLandParcels(undefined));
                dispatch(storeLandmarks(undefined));
                dispatch(storeHistory(undefined));
                navigate("/login");
              }}
            />
          </Tooltip>
          <UserName name={userLogin} />
        </div>
      </div>
      <LandParcelWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        showGraphQL={WIZARD_SHOW_GRAPHQL}
      />
    </div>
  );
};
export default UserBar;
