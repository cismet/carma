import { Select, Tooltip } from "antd";
import { useSelector } from "react-redux";
import { getGemarkungen, getLandparcels } from "../../store/slices/search";
import { useState } from "react";
import proj4 from "proj4";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faA,
  faComment,
  faG,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { useRef } from "react";
import { useSearchParams } from "react-router-dom";
import "../ui/select.css";

const LandParcelChooser = ({
  setGazetteerHit,
  setOverlayFeature,
  setShowLandParcelChooser,
  setShowFIcon,
}) => {
  const landparcels = useSelector(getLandparcels);
  const gemarkungen = useSelector(getGemarkungen);
  const [selectedGemarkung, setSelectedGemarkung] = useState();
  const [selectedFlur, setSelectedFlur] = useState();
  const [selectedFlurstueckLabel, setSelectedFlurstueckLabel] = useState();
  const [urlParams, setUrlParams] = useSearchParams();

  const gemarkungRef = useRef();
  const flurRef = useRef();
  const flurstueckRef = useRef();

  const buildData = (xx) => {
    const gemarkungLookup = {};
    for (const g of gemarkungen) {
      gemarkungLookup[g.gemarkungsnummer] = g.name;
    }
    const result = {};
    for (const f of xx) {
      const splitted = f.alkis_id.split("-");
      const gemarkung = splitted[0].substring(2);
      const flur = splitted[1];
      const flurstueck = splitted[2];
      const x = f.pointOnSurfaceX;
      const y = f.pointOnSurfaceY;
      if (result[gemarkung]) {
        if (result[gemarkung].flure[flur]) {
          result[gemarkung].flure[flur].flurstuecke[flurstueck] = {
            label: flurstueck,
            lfk: f.schluessel_id,
            alkis_id: f.alkis_id,
            x: x,
            y: y,
          };
        } else {
          result[gemarkung].flure[flur] = {
            flur: flur,
            flurstuecke: {},
          };
          result[gemarkung].flure[flur].flurstuecke[flurstueck] = {
            label: flurstueck,
            lfk: f.schluessel_id,
            alkis_id: f.alkis_id,
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
          alkis_id: f.alkis_id,
          x: x,
          y: y,
        };
      }
    }
    return result;
  };

  const removeLeadingZeros = (numberStr, flur = false) => {
    if (!numberStr) {
      return undefined;
    }
    const parts = numberStr.split("/");

    const trimmedParts = parts.map((part) => {
      let startIndex = 0;

      while (startIndex < part.length && part[startIndex] === "0") {
        startIndex++;
      }

      return part.substring(startIndex);
    });

    const flurResalt = trimmedParts.join("/");

    const result =
      trimmedParts.length > 1
        ? trimmedParts.join("/")
        : trimmedParts.join("") + "/0";

    return !flur ? result : flurResalt;
  };

  const handleGemarkungChange = (gemarkungValue) => {
    const fullGemarkung = data[gemarkungValue];
    setSelectedGemarkung(fullGemarkung);
    setSelectedFlur(undefined);
    setSelectedFlurstueckLabel(undefined);

    setTimeout(() => {
      flurRef.current.focus();
    }, 10);
  };
  const handleFlurChange = (flurValue) => {
    setSelectedFlur(selectedGemarkung.flure[flurValue]);
    setSelectedFlurstueckLabel(undefined);

    setTimeout(() => {
      flurstueckRef.current.focus();
    }, 10);
  };

  const handleFlurstueckChange = (flurstueckLabel) => {
    setSelectedFlurstueckLabel(flurstueckLabel);
    const selectedFlurstueck = selectedFlur.flurstuecke[flurstueckLabel];

    const updatedCoordinates = proj4("EPSG:25832", "EPSG:3857", [
      selectedFlurstueck.x,
      selectedFlurstueck.y,
    ]);

    const latLng = proj4("EPSG:25832", "EPSG:4326", [
      selectedFlurstueck.x,
      selectedFlurstueck.y,
    ]);

    setUrlParams((prev) => {
      prev.set("zoom", 18);
      prev.set("lat", latLng[1]);
      prev.set("lng", latLng[0]);
      return prev;
    });

    setOverlayFeature("gazetteerHitTrigger");

    setGazetteerHit({
      sorter: 37717,
      string: "Flurstück",
      glyph: "home",
      x: Math.round(updatedCoordinates[0] * 100) / 100,
      y: Math.round(updatedCoordinates[1] * 100) / 100,
      more: {
        zl: 18,
      },
      type: "pois",
    });

    flurstueckRef.current.blur();
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

  const getGemarkungByName = (name) => {
    const result = Object.keys(data).find((key) => {
      return data[key].gemarkung === name;
    });
    if (result) {
      return data[result];
    }
  };

  const resetStates = () => {
    setSelectedGemarkung(null);
    setSelectedFlur(null);
    setSelectedFlurstueckLabel(null);
    setGazetteerHit(null);
    setOverlayFeature(null);
  };

  let data = {};

  if (landparcels.length > 0) {
    data = buildData(landparcels);
  }

  return (
    <div className="absolute flex items-center gap-[2px] bottom-[5px] left-[10px] z-[999]">
      <Tooltip
        title={selectedGemarkung ? "Suche zurücksetzen" : "Adressensuche"}
        align={{
          offset: [0, -6],
        }}
      >
        <button
          className="border-[#0d6efd] z-[9999] bg-gradient-to-b from-[#ffffff] to-[#e0e0e0] h-[34px] w-[32px] border rounded-l-[4px]"
          onClick={() =>
            selectedGemarkung ? resetStates() : setShowLandParcelChooser(false)
          }
        >
          <FontAwesomeIcon
            icon={selectedGemarkung ? faXmark : faA}
            className={`${selectedGemarkung ? "text-xl" : "h-4"} mt-[2px]`}
            onClick={() => setShowFIcon(true)}
          />
        </button>
      </Tooltip>
      <Select
        ref={gemarkungRef}
        className="w-[108px] -ml-[8px]"
        placeholder="Gemarkung"
        autoFocus
        showSearch
        value={selectedGemarkung?.gemarkung || undefined}
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
        options={Object.keys(data).map((key) => {
          const el = data[key];
          return { label: el.gemarkung, value: key };
        })}
      />
      <Select
        className="w-30"
        ref={flurRef}
        value={selectedFlur?.flur || undefined}
        placeholder="Flur"
        key={"Flure.for." + (selectedGemarkung?.gemarkung || "-")}
        showSearch
        onKeyDown={handleKeyFlur}
        onChange={handleFlurChange}
        filterOption={(input, option) =>
          (option?.label ?? "").toLowerCase().startsWith(input)
        }
        filterSort={(optionA, optionB) =>
          parseInt(optionA.label, 10) - parseInt(optionB.label, 10)
        }
        options={Object.keys(selectedGemarkung?.flure || []).map((key) => {
          const el = selectedGemarkung?.flure[key];
          return { label: removeLeadingZeros(el.flur, true), value: key };
        })}
      />
      <Select
        className="w-[96px]"
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
        options={Object.keys(selectedFlur?.flurstuecke || []).map((key) => {
          const el = selectedFlur?.flurstuecke[key];
          return {
            label: <span>{removeLeadingZeros(el.label)}</span>,
            value: key,
          };
        })}
      />
    </div>
  );
};

export default LandParcelChooser;
