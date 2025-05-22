import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { getLinkForDoc } from "../../../utils/kassenzeichenHelper";
import DocIcon from "./DocIcon";

interface DocumentProps {
  fileObject: any;
  remove?: () => void;
  background?: string;
  addComma?: boolean;
}

const Comp = ({
  fileObject,
  remove,
  background = "#eeeeee",
  addComma,
}: DocumentProps) => {
  const [verifiedState, setVerifiedState] = useState("unverified");
  useEffect(() => {
    if (fileObject.inProgress !== true && verifiedState === "unverified") {
      let url = getLinkForDoc(fileObject);

      fetch(url, {
        method: "head",
      })
        .then(function (response) {
          if (response.status >= 200 && response.status < 300) {
            setVerifiedState("verified");
          } else {
            setVerifiedState("error");
          }
        })
        .catch(function (err) {
          console.error("error when head checking url " + url, err);

          setVerifiedState("error");
        });
      // setTimeout(() => {
      // 	setVerifiedState('verified');
      // }, 1000);
    }
  });
  let color;
  let comma = "";
  if (addComma === true) {
    comma = ",";
  }
  switch (verifiedState) {
    case "unverified":
      color = "grey";
      break;
    case "verified":
      color = "black";
      break;
    case "error":
      color = "#B05353";
      break;
    default:
      color = "grey";
  }

  let deleteLink;
  if (remove !== undefined) {
    deleteLink = (
      <a
        style={{ color, cursor: "pointer" }}
        onClick={() => {
          remove();
        }}
      >
        &times;
      </a>
    );
  }

  let status;
  if (verifiedState === "unverified") {
    status = (
      <span>
        &nbsp;
        <FontAwesomeIcon icon={faSpinner} spin />
      </span>
    );
  }

  let main = (
    <span style={{ marginLeft: 5, marginRight: 0 }}>
      {fileObject.name + comma}
    </span>
  );
  if (verifiedState === "verified") {
    main = (
      <a
        style={{ color, cursor: "pointer" }}
        target="_additional_docs"
        href={getLinkForDoc(fileObject)}
        download={fileObject.name}
      >
        {main}
      </a>
    );
  }

  return (
    <span
      style={{
        color,
        padding: "4px",
        borderRadius: 4,
        background,
        display: "inline",
        lineHeight: "2em",
      }}
    >
      <DocIcon fileEnding={fileObject.name.split(".").pop()} />
      &nbsp;
      {main}&nbsp;{deleteLink}
      {status}
    </span>
  );
};

export default Comp;
