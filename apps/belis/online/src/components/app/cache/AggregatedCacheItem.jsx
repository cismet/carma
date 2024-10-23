import {
  faCalendarAlt,
  faCheckCircle,
  faExclamationCircle,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import React, { useState } from "react";
import ProgressBar from "react-bootstrap/ProgressBar";

import CacheItem, { getUpdateString } from "./CacheItem";

const AggregatedCacheItem = ({ controls, renew }) => {
  const [expanded, setExpanded] = useState(false);
  if (expanded === false) {
    let loadingState;
    let cachingProgress = 0;
    let lastUpdate = undefined;
    for (const control of controls) {
      if (lastUpdate === undefined || control.lastUpdate < lastUpdate) {
        lastUpdate = control.lastUpdate;
      }
      if (control.loadingState === "loading" || control.loadingState === "caching") {
        loadingState = "progress";
      }
      if (control.loadingState === "problem") {
        loadingState = "problem";
        break;
      }
      if (control.loadingState === "cached") {
        cachingProgress++;
      }
    }

    if (cachingProgress === controls.length) {
      loadingState = "cached";
    }
    const buttons = (
      <td style={{ width: 120, whiteSpace: "nowrap" }}>
        {/* <Button
					style={{ margin: 3 }}
					variant='outline-primary'
					size='sm'
					onClick={() => {
						renew();
					}}
				>
					<Icon icon={faDownload} />
				</Button>

				<Button style={{ margin: 3 }} variant='outline-success' size='sm'>
					<Icon icon={faSync} />
				</Button> */}
      </td>
    );
    if (loadingState === undefined) {
      return (
        <tr>
          {buttons}
          <td style={{ textAlign: "right", paddingLeft: "25px", paddingRight: "15px" }}>
            {controls.length}
          </td>
          <td style={{ textAlign: "left", width: "100%", paddingRight: 5 }}>
            sonstige Tabellen (
            <a
              onClick={() => {
                setExpanded(true);
              }}
              href='#'
            >
              Details
            </a>
            )
          </td>
          <td style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "25px" }}>
            <Icon icon={faCalendarAlt} /> {getUpdateString(lastUpdate)}
          </td>
        </tr>
      );
    } else if (loadingState === "progress") {
      return (
        <tr>
          {buttons}
          <td style={{ textAlign: "right", paddingLeft: "25px", paddingRight: "15px" }}>
            {controls.length}
          </td>
          <td style={{ textAlign: "left", width: "100%" }}>
            <ProgressBar
              animated
              now={cachingProgress}
              label={"sonstige Tabellen"}
              max={controls.length}
              onClick={() => {
                setExpanded(true);
              }}
              style={{ cursor: "pointer" }}
            />
          </td>
          <td style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "25px" }}>
            <Icon spin icon={faSpinner} /> ... schreiben
          </td>
        </tr>
      );
    } else if (loadingState === "cached") {
      return (
        <tr>
          {buttons}
          <td style={{ textAlign: "right", paddingLeft: "25px", paddingRight: "15px" }}>
            {controls.length}
          </td>
          <td style={{ textAlign: "left", width: "100%" }}>
            <ProgressBar
              now={cachingProgress}
              label={"sonstige Tabellen"}
              max={controls.length}
              onClick={() => {
                setExpanded(true);
              }}
              style={{ cursor: "pointer" }}
            />
          </td>
          <td style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "25px" }}>
            <Icon icon={faCheckCircle} /> alles geschrieben
          </td>
        </tr>
      );
    } else if (loadingState === "problem") {
      return (
        <tr>
          {buttons}
          <td style={{ textAlign: "right", paddingLeft: "25px", paddingRight: "15px" }}>
            {controls.length}
          </td>
          <td style={{ textAlign: "left", width: "100%" }}>
            <ProgressBar
              now={controls.length}
              label={"sonstige Tabellen"}
              max={controls.length}
              onClick={() => {
                setExpanded(true);
              }}
              // variant='warning'
              style={{ cursor: "pointer" }}
            />
          </td>
          <td style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "25px" }}>
            <Icon icon={faExclamationCircle} /> Probleme
          </td>
        </tr>
      );
    } else {
      return (
        <tr>
          <td />
        </tr>
      );
    }
  } else {
    let comps = [
      <tr>
        <td />
        <td />
        <td>
          <a
            onClick={() => {
              setExpanded(false);
            }}
            href='#'
          >
            sonstige Tabellen verbergen
          </a>
        </td>
      </tr>,
    ];
    for (const control of controls) {
      comps.push(
        <CacheItem
          key={"CacheItem." + comps.length + 1}
          control={control}
          renew={() => {
            renew(control.key);
          }}
        />
      );
    }
    return comps;
  }
};

export default AggregatedCacheItem;
