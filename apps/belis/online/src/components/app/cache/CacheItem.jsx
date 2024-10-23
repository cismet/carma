import {
  faCalendarAlt,
  faCheckCircle,
  faCheckSquare,
  faDatabase,
  faDownload,
  faExclamationCircle,
  faQuestionCircle,
  faSpinner,
  faSync,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import React from "react";
import { Button } from "react-bootstrap";
import ProgressBar from "react-bootstrap/ProgressBar";
import { useSelector } from "react-redux";

import { getTeam } from "../../../core/store/slices/team";

const getIconForLoadingState = (ls) => {
  if (ls === "loading") {
    return <Icon spin icon={faSpinner} />;
  } else if (ls === "caching") {
    return <Icon spin icon={faDatabase} />;
  } else if (ls === "cached") {
    return <Icon icon={faCheckSquare} />;
  } else if (ls === "problem") {
    return <Icon icon={faExclamationCircle} />;
  } else {
    return <Icon icon={faQuestionCircle} />;
  }
};

const CacheItem = ({ info, config, renew, refresh = () => {}, refreshAllowed }) => {
  const { lastUpdate, loadingState, objectCount, updateCount, cachingProgress } = info;
  const { name, key, getName } = config;
  const selectedTeam = useSelector(getTeam);

  const controls = (
    <td key={"td." + key} style={{ width: 120, whiteSpace: "nowrap" }}>
      <Button
        disabled={loadingState === "loading" || !refreshAllowed}
        style={{ margin: 3 }}
        variant='outline-primary'
        size='sm'
        onClick={() => {
          renew();
        }}
      >
        <Icon icon={faDownload} />
      </Button>

      {/* <Button
        style={{ margin: 3 }}
        variant='outline-success'
        disabled
        onClick={() => {
          renew();
        }}
        size='sm'
      >
        <Icon icon={faSync} />
      </Button> */}
    </td>
  );

  const counts = (
    <td
      key={"td.counts.1." + key}
      style={{ textAlign: "right", paddingLeft: "25px", paddingRight: "15px" }}
    >
      {objectCount}
    </td>
  );
  const cols = [];
  cols[0] = controls;
  cols[1] = counts;

  if (loadingState === undefined) {
    cols[3] = (
      <td key={"td[3]." + key} style={{ textAlign: "left", width: "100%" }}>
        {getName !== undefined ? getName(selectedTeam) : name}
      </td>
    );
    cols[4] = (
      <td
        key={"td[4]." + key}
        style={{ textAlign: "left", paddingLeft: "25px", whiteSpace: "nowrap" }}
      >
        <Icon icon={faCalendarAlt} /> {getUpdateString(lastUpdate)}
      </td>
    );
  } else if (loadingState === "loading") {
    // setStartTime(new Date().getTime());
    cols[3] = (
      <td key={"td[3]." + key} style={{ textAlign: "left", width: "100%" }}>
        {getName !== undefined ? getName(selectedTeam) : name}
      </td>
    );
    cols[4] = (
      <td
        key={"td[4]." + key}
        style={{ textAlign: "left", paddingLeft: "25px", whiteSpace: "nowrap" }}
      >
        <Icon spin icon={faSpinner} /> laden
      </td>
    );
  } else if (loadingState === "caching") {
    cols[3] = (
      <td key={"td[3]." + key} style={{ textAlign: "left", width: "100%" }}>
        <ProgressBar
          animated
          now={cachingProgress}
          label={getName !== undefined ? getName(selectedTeam) : name}
          max={updateCount}
        />
      </td>
    );
    cols[4] = (
      <td
        key={"td[4]." + key}
        style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "25px" }}
      >
        <Icon spin icon={faSpinner} /> {updateCount} schreiben
      </td>
    );
  } else if (loadingState === "cached") {
    cols[3] = (
      <td key={"td[3]." + key} style={{ textAlign: "left", width: "100%" }}>
        <ProgressBar
          key={"ProgressBar." + key}
          now={updateCount}
          label={getName !== undefined ? getName(selectedTeam) : name}
          max={updateCount}
        />
      </td>
    );
    cols[4] = (
      <td
        key={"td[4]." + key}
        style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "25px" }}
      >
        <Icon icon={faCheckCircle} /> {updateCount} geschrieben
      </td>
    );
  } else if (loadingState === "problem") {
    cols[3] = (
      <td key={"td[3]." + key} style={{ textAlign: "left", width: "100%" }}>
        <ProgressBar
          variant='warning'
          now={100}
          label={getName !== undefined ? getName(selectedTeam) : name}
          max={100}
        />
      </td>
    );
    cols[4] = (
      <td
        key={"td[4]." + key}
        tyle={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "25px" }}
      >
        <Icon icon={faExclamationCircle} /> Problem
      </td>
    );
  }
  return <tr>{cols}</tr>;
};

export const getUpdateString = (lastUpdate) => {
  if (lastUpdate > 0) {
    const today = new Date();
    const d = new Date(lastUpdate);
    const hh = (d.getHours() + "").padStart(2, "0");
    const mm = (d.getMinutes() + "").padStart(2, "0");
    const dd = (d.getDate() + "").padStart(2, "0");
    const mm2 = (d.getMonth() + 1 + "").padStart(2, "0");
    const time = hh + ":" + mm;

    let result;
    if (
      false &&
      today.getFullYear() === d.getFullYear() &&
      today.getMonth() === d.getMonth() &&
      today.getDate() === d.getDate()
    ) {
      result = time;
    } else {
      result = dd + "." + mm2 + ". " + time;
    }
    return result;
  } else {
    return "?";
  }
};

export default CacheItem;
