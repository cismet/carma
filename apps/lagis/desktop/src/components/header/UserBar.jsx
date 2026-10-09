import UserName from "./UserName";
import { Tooltip, message } from "antd";
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
  getEditActive,
  getEditDirty,
  getEditParcel,
} from "../../store/slices/editing";
import { discardEditing, saveEditing } from "../../core/editing/session";
import EditControls, {
  showSaveError,
  urlParamsOf,
} from "../editing/EditControls";
import UnsavedChangesDialog from "../editing/UnsavedChangesDialog";
import {
  getSyncLandparcel,
  setFetchLandParcelError,
} from "../../store/slices/ui";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { removeLeadingZeros } from "../../core/tools/helper";
import { LandParcelSearch } from "@carma-mapping/fuzzy-search";
import LandParcelHistoryNav from "../navigation/lp-history/LandParcelHistoryNav";
import LandParcelWizard from "../wizard/LandParcelWizard";
import {
  getCurrentLParcelNav,
  setCurrentLP,
} from "../../store/slices/lpHistoryNav";

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
  const isEdit = useSelector(getEditActive);
  const isDirty = useSelector(getEditDirty);
  const editParcel = useSelector(getEditParcel);
  // { kind: "parcel", params } or { kind: "logout" } while the dialog asks
  const [leaveTarget, setLeaveTarget] = useState(undefined);
  // set while the URL is put back after a declined parcel switch
  const restoringUrlRef = useRef(false);

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

  const navLabel = ({ gem, flur, fstck }) =>
    gem +
    " " +
    removeLeadingZeros(flur, true) +
    " " +
    removeLeadingZeros(fstck.replace("-", "/"));

  const loadParcel = (params) => {
    const { gem, flur, fstck } = params;
    const fullFstckLabel = navLabel(params);
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
  };

  const isEditedParcel = (params) =>
    ["gem", "flur", "fstck"].every(
      (name) => params[name] === editParcel?.urlParams?.[name]
    );

  // React to URL param changes (from LandParcelHistoryNav or direct URL navigation)
  useEffect(() => {
    if (!landparcelInternaDataStructure) return;
    if (restoringUrlRef.current) {
      restoringUrlRef.current = false;
      return;
    }

    const params = urlParamsOf(urlParams);
    if (!params.gem || !params.flur || !params.fstck) return;

    if (isEdit && editParcel && !isEditedParcel(params)) {
      if (isDirty) {
        setLeaveTarget({ kind: "parcel", params });
      } else {
        dispatch(discardEditing()).then(() => loadParcel(params));
      }
      return;
    }
    loadParcel(params);
  }, [urlParams, landparcelInternaDataStructure]);

  const logout = () => {
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
  };

  // the lock needs the JWT, so edit mode ends before it is dropped
  const handleLogout = () => {
    if (!isEdit) {
      logout();
      return;
    }
    const endAndLogout = async () => {
      await dispatch(discardEditing());
      logout();
    };
    if (!isDirty) {
      endAndLogout();
      return;
    }
    setLeaveTarget({ kind: "logout" });
  };

  const continueLeaving = () => {
    if (leaveTarget.kind === "parcel") {
      loadParcel(leaveTarget.params);
    } else {
      logout();
    }
    setLeaveTarget(undefined);
  };

  const cancelLeaving = () => {
    if (leaveTarget.kind === "parcel") {
      restoringUrlRef.current = true;
      setUrlParams(editParcel.urlParams);
      // the history arrows already moved on; point them back
      dispatch(setCurrentLP(navLabel(editParcel.urlParams)));
    }
    setLeaveTarget(undefined);
  };

  const discardAndLeave = async () => {
    await dispatch(discardEditing());
    continueLeaving();
  };

  // saveEditing also ends edit mode and releases the lock
  const saveAndLeave = async () => {
    try {
      await dispatch(saveEditing());
      message.success("Änderungen gespeichert");
      continueLeaving();
    } catch (error) {
      showSaveError(error);
    }
  };

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
        <EditControls />
        <Tooltip
          title={
            isEdit
              ? "Im Bearbeitungsmodus nicht verfügbar"
              : "Flurstücksassistent öffnen"
          }
          placement="bottom"
        >
          <PartitionOutlined
            className={`text-sm ${
              isEdit ? "cursor-not-allowed" : "cursor-pointer"
            }`}
            style={{
              paddingRight: "12px",
              color: isEdit ? "#bfbfbf" : undefined,
            }}
            onClick={isEdit ? undefined : () => setWizardOpen(true)}
            data-test-id="open-landparcel-wizard"
          />
        </Tooltip>
        <div className="logout ml-auto pl-1 flex items-center">
          <Tooltip title="Ausloggen" placement="right">
            <LogoutOutlined
              className="text-sm cursor-pointer"
              style={{ paddingRight: "12px" }}
              onClick={handleLogout}
            />
          </Tooltip>
          <UserName name={userLogin} />
        </div>
      </div>
      <LandParcelWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
      />
      <UnsavedChangesDialog
        open={Boolean(leaveTarget)}
        title={
          leaveTarget?.kind === "logout" ? "Abmelden" : "Flurstück wechseln"
        }
        onCancel={cancelLeaving}
        onDiscard={discardAndLeave}
        onSave={saveAndLeave}
      />
    </div>
  );
};
export default UserBar;
