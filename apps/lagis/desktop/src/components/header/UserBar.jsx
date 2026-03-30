import UserName from "./UserName";
import { Tooltip } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
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
} from "../../store/slices/lagis";
import { setHasFittedBounds } from "../../store/slices/mapping";
import {
  getSyncLandparcel,
  setFetchLandParcelError,
} from "../../store/slices/ui";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { removeLeadingZeros } from "../../core/tools/helper";
import { LandParcelSearch } from "@carma-mapping/fuzzy-search";
import LandParcelHistoryNav from "../navigation/lp-history/LandParcelHistoryNav";

const UserBar = () => {
  const dispatch = useDispatch();
  const userLogin = useSelector(getLogin);
  const syncLandparcel = useSelector(getSyncLandparcel);
  const navigate = useNavigate();
  const { landParcels } = useSelector(getLandParcels);
  const { landmarks } = useSelector(getLandmarks);
  const landparcelInternaDataStructure = useSelector(
    getLandparcelInternaDataStructure
  );

  useEffect(() => {
    if (landParcels && landParcels.length > 1) {
      dispatch(
        buildLandparcelInternalDataStructure(landParcels, landmarks || [])
      );
    }
  }, [landParcels, landmarks]);

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
        onSelection={(hit) => {
          if (!hit) return;
          const fstck = hit.more?.parcel;
          if (fstck?.lfk) {
            dispatch(
              fetchFlurstueck(fstck.lfk, fstck.alkis_id, navigate, () =>
                dispatch(setFetchLandParcelError(true))
              )
            );
            handleOpenLandparcelInJavaApp(fstck);
            setTimeout(() => {
              dispatch(setHasFittedBounds(false));
            }, 800);
          }
        }}
        showDropdownBelow={true}
        showButton={false}
      />
      <div className="ml-auto flex gap-1 items-center">
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
    </div>
  );
};
export default UserBar;
