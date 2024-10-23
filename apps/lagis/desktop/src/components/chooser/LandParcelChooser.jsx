import React, { useState, useRef, useEffect } from "react";
import { BankOutlined, BlockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Select } from "antd";
import { useSearchParams } from "react-router-dom";
import {
  storeLagisLandparcel,
  storeAlkisLandparcel,
  getLandparcel,
  getAlkisLandparcel,
  storeMipa,
  storeRebe,
  storeHistory,
  switchToLandparcel,
  getSelectedGemarkung,
  getSelectedFlur,
  getSelectedFlurstueckLabel,
  storeSelectedGemarkung,
  storeSelectedFlur,
  buildLandparcelInternalDataStructure,
  getLandparcelInternaDataStructure,
  storeSelectedFlurstueckLabel,
} from "../../store/slices/lagis";
import { getSyncLandparcel } from "../../store/slices/ui";
import { useDispatch, useSelector } from "react-redux";
import { Tooltip } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import {
  defaultLinksColor,
  removeLeadingZeros,
  replaceSlashWithDash,
} from "../../core/tools/helper";

function paramsToObject(entries) {
  const result = {};
  for (const [key, value] of entries) {
    // each 'entry' is a [key, value] tupple
    result[key] = value;
  }
  return result;
}
const LandParcelChooser = ({
  flurstueckChoosen = (fstck) => {},
  all,
  gemarkungen,
}) => {
  const [urlParams, setUrlParams] = useSearchParams();
  const dispatch = useDispatch();
  const landparcel = useSelector(getLandparcel);
  const alkisLandparcel = useSelector(getAlkisLandparcel);
  const ifSyncLandparcel = useSelector(getSyncLandparcel);
  // const [selectedGemarkung, setSelectedGemarkung] = useState();
  // const [selectedFlur, setSelectedFlur] = useState();
  // const [selectedFlurstueckLabel, setSelectedFlurstueckLabel] = useState();
  const selectedGemarkung = useSelector(getSelectedGemarkung);
  const selectedFlur = useSelector(getSelectedFlur);
  const selectedFlurstueckLabel = useSelector(getSelectedFlurstueckLabel);
  const gemarkungRef = useRef();
  const flurRef = useRef();
  const flurstueckRef = useRef();
  const landparcelInternaDataStructure = useSelector(
    getLandparcelInternaDataStructure
  );

  useEffect(() => {
    console.log("all", all);
    if (all && all.length > 1) {
      dispatch(buildLandparcelInternalDataStructure(all, gemarkungen));
    }
  }, [all]);

  const removeLagisStore = () => {
    dispatch(storeAlkisLandparcel(undefined));
    dispatch(storeLagisLandparcel(undefined));
    dispatch(storeRebe(undefined));
    dispatch(storeMipa(undefined));
    dispatch(storeHistory(undefined));
  };

  useEffect(() => {
    if (!landparcelInternaDataStructure) {
      return;
    }
    removeLagisStore();

    const fromUrl = {
      gem: urlParams.get("gem") || undefined,
      flur: urlParams.get("flur") || undefined,
      fstck: urlParams.get("fstck") || undefined,
    };

    gotoFstckFromUrl(fromUrl);
  }, [urlParams, landparcelInternaDataStructure]);

  const handleGemarkungChange = (gemarkungValue) => {
    if (alkisLandparcel !== undefined && landparcel !== undefined) {
      // removeLagisStore();
    }
    const fullGemarkung = landparcelInternaDataStructure[gemarkungValue];

    dispatch(storeSelectedGemarkung(fullGemarkung));
    dispatch(storeSelectedFlur(undefined));
    dispatch(storeSelectedFlurstueckLabel(undefined));
    setTimeout(() => {
      flurRef.current.focus();
    }, 10);
  };
  const handleFlurChange = (flurValue) => {
    if (alkisLandparcel !== undefined && landparcel !== undefined) {
      // removeLagisStore();
    }
    dispatch(storeSelectedFlur(selectedGemarkung.flure[flurValue]));
    dispatch(storeSelectedFlurstueckLabel(undefined));
    setTimeout(() => {
      flurstueckRef.current.focus();
    }, 10);
  };

  const handleFlurstueckChange = (flurstueckLabel) => {
    dispatch(storeSelectedFlurstueckLabel(flurstueckLabel));
    flurstueckChoosen({
      gemarkung: selectedGemarkung.gemarkung,
      flur: selectedFlur.flur,
      ...selectedFlur.flurstuecke[flurstueckLabel],
    });
  };
  const handleKeyGemarkung = (e) => {
    if (e.key === "Enter") {
      flurRef.current.focus();
    }
  };
  const handleKeyFlur = (e) => {
    if (e.key === "Enter") {
      flurstueckRef.current.focus();
    }
  };

  const gotoFstckFromUrl = ({ gem, flur, fstck }) => {
    dispatch(
      switchToLandparcel({
        gem,
        flur,
        fstck,
        flurstueckChoosen,
        updateFromUrl: true,
      })
    );
  };

  const handleRefreshData = () => {
    if (selectedGemarkung && selectedFlur && selectedFlurstueckLabel) {
      removeLagisStore();
      flurstueckChoosen({
        gemarkung: selectedGemarkung.gemarkung,
        flur: selectedFlur.flur,
        ...selectedFlur.flurstuecke[selectedFlurstueckLabel],
      });
    }
  };
  if (!landparcelInternaDataStructure) {
    return null; //could be improved with 3 fake <Select> elements that are disabled and says "... laden"
  }

  const flurstueckOptions = Object.keys(selectedFlur?.flurstuecke || []).map(
    (key) => {
      const el = selectedFlur?.flurstuecke[key];
      let color = "lightgrey";
      if (el.hist === false && el.art === "städtisch") {
        color = "black";
      } else if (el.hist === false && el.art === "Abteilung IX") {
        color = "purple";
      }
      return {
        label: (
          <span style={{ color }}>
            <span className="mr-1 text-sm">
              {el.art === "städtisch" ? <BankOutlined /> : <BlockOutlined />}
            </span>
            {removeLeadingZeros(el.label)}
          </span>
        ),
        value: key,
      };
    }
  );

  // Check if selectedFlurstueckLabel is not in the options and add it

  if (
    selectedFlurstueckLabel &&
    !flurstueckOptions.some(
      (option) => option.value === selectedFlurstueckLabel
    )
  ) {
    flurstueckOptions.push({
      label: (
        <span style={{ color: "#F0E0C0" }}>
          <span className="mr-1 text-sm">
            <UserOutlined />
          </span>
          {removeLeadingZeros(selectedFlurstueckLabel)}
        </span>
      ),
      value: selectedFlurstueckLabel,
      artificial: true,
    });
  }

  const artificial =
    flurstueckOptions.find((option) => option.value === selectedFlurstueckLabel)
      ?.artificial === true;

  return (
    <>
      <Select
        ref={gemarkungRef}
        value={selectedGemarkung?.gemarkung || undefined}
        showSearch
        placeholder="Gemarkung"
        style={{
          width: 160,
        }}
        filterOption={(input, option) =>
          (option?.label ?? "").toLowerCase().startsWith(input.toLowerCase())
        }
        optionFilterProp="children"
        filterSort={(optionA, optionB) =>
          (optionA?.label ?? "")
            .toLowerCase()
            .localeCompare((optionB?.label ?? "").toLowerCase())
        }
        onKeyDown={handleKeyGemarkung}
        onChange={handleGemarkungChange}
        options={Object.keys(landparcelInternaDataStructure).map((key) => {
          const el = landparcelInternaDataStructure[key];
          return { label: el.gemarkung, value: key };
        })}
        selectorBg="red"
      />
      <Select
        ref={flurRef}
        value={selectedFlur?.flur || undefined}
        placeholder="Flur"
        key={"Flure.for." + (selectedGemarkung?.gemarkung || "-")}
        showSearch
        style={{
          width: 100,
        }}
        onKeyDown={handleKeyFlur}
        className="mx-1"
        filterOption={(input, option) =>
          (option?.label ?? "").toLowerCase().startsWith(input)
        }
        filterSort={(optionA, optionB) =>
          parseInt(optionA.label, 10) - parseInt(optionB.label, 10)
        }
        onChange={handleFlurChange}
        options={Object.keys(selectedGemarkung?.flure || []).map((key) => {
          const el = selectedGemarkung?.flure[key];
          return { label: removeLeadingZeros(el.flur, true), value: key };
        })}
      />
      <Select
        ref={flurstueckRef}
        value={selectedFlurstueckLabel || undefined}
        key={
          "Flurstuecke.for." +
          (selectedGemarkung?.gemarkung || "-") +
          "." +
          selectedFlur?.flur
        }
        placeholder="Flurstück"
        showSearch
        style={{
          width: 150,
        }}
        filterOption={(input, option) => {
          const inputValue = input.toLowerCase();
          const optionValue = (
            removeLeadingZeros(option.value) || ""
          ).toLowerCase();
          return optionValue.startsWith(inputValue);
        }}
        filterSort={(optionA, optionB) => {
          return parseFloat(optionA.value) - parseFloat(optionB.value);
        }}
        onChange={handleFlurstueckChange}
        options={flurstueckOptions}
        ___options={Object.keys(selectedFlur?.flurstuecke || []).map((key) => {
          const el = selectedFlur?.flurstuecke[key];
          let color = "lightgrey";
          if (el.hist === false && el.art === "städtisch") {
            color = "black";
          } else if (el.hist === false && el.art === "Abteilung IX") {
            color = "purple";
          }
          return {
            label: (
              <span style={{ color }}>
                <span className="mr-1 text-sm">
                  {el.art === "städtisch" ? (
                    <BankOutlined />
                  ) : (
                    <BlockOutlined />
                  )}
                </span>
                {removeLeadingZeros(el.label)}
              </span>
            ),
            value: key,
          };
        })}
      />
      <Tooltip title="Flurstück neu laden">
        <SyncOutlined
          className="ml-6 cursor-pointer hover:text-slate-400"
          onClick={handleRefreshData}
          style={{
            color:
              !selectedGemarkung || !selectedFlur || !selectedFlurstueckLabel
                ? defaultLinksColor
                : null,
          }}
        />
      </Tooltip>
    </>
  );
};

export default LandParcelChooser;

// export const removeLeadingZeros = (numberStr, flur = false) => {
//   if (!numberStr) {
//     return undefined;
//   }
//   const parts = numberStr.split("/");

//   const trimmedParts = parts.map((part) => {
//     let startIndex = 0;

//     while (startIndex < part.length && part[startIndex] === "0") {
//       startIndex++;
//     }

//     return part.substring(startIndex);
//   });

//   const flurResalt = trimmedParts.join("/");

//   const result =
//     trimmedParts.length > 1
//       ? trimmedParts.join("/")
//       : trimmedParts.join("") + "/0";

//   return !flur ? result : flurResalt;
// };
