import { faBullseye, faGlassMartini, faGripLinesVertical } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Timeline } from "antd";
import IconLink from "react-cismap/commons/IconLink";

import { getWebDavUrl } from "../../../../constants/belis";
import { getVCard } from "../../../../core/helper/featureHelper";
import { showDialog } from "../../../../core/store/slices/app";
import { addImageToObjectAction } from "../../../../core/store/slices/offlineActionDb";
import AddImageDialog from "../../../app/dialogs/AddImage";

export const getDate = (d) => {
  if (d) {
    if (typeof d === "string") {
      return new Date(Date.parse(d)).toLocaleDateString();
    } else if (typeof d === "number") {
      return new Date(d).toLocaleDateString();
    } else {
      console.log("d", d, typeof d);
    }
  } else {
    return undefined;
  }
};

export const getStrasse = (streetObject, hausnummer) => {
  if (streetObject) {
    return (
      <div>
        {streetObject.strasse} ({streetObject.pk}) {hausnummer}
      </div>
    );
  }
};

export const sortAndFilterEvents = (events) => {
  // console.log("events vor sort", events);
  const result = events.filter((x) => x[1] !== undefined && x[1] !== null);
  result.sort((a, b) => {
    try {
      if (a[1] && b[1]) {
        const da = new Date(a[1].replace(" ", "T")).getTime();
        const db = new Date(b[1].replace(" ", "T")).getTime();
        return da - db;
      } else {
        return -1;
      }
    } catch (e) {
      return -1;
    }
  });

  // console.log("events nach sort & filter");
  // for (const r of result) {
  // console.log(r[0], r[1], new Date(r[1]).getTime(), new Date(r[1]));
  // }
  return result;
};

export const convertToProperUpperLowerCase = (string) => {
  let result = string;
  if (result) {
    result = convertStringArrayToProperUpperLowerCase(result.split(" ")).join(" ");
    // result = convertStringArrayToProperUpperLowerCase(result.split("-")).join("-");
    return result;
  }
};
const convertStringArrayToProperUpperLowerCase = (array) => {
  const result = [];
  for (const substring of array) {
    result.push(convertSingleStringToProperUpperLowerCase(substring));
  }
  return result;
};
const convertSingleStringToProperUpperLowerCase = (string) => {
  if (string) {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
  }
};
export const addDotThumbnail = (_url) => {
  let url = _url;
  if (url.endsWith(".jpg")) {
    url += ".thumbnail.jpg";
  } else if (url.endsWith(".png")) {
    url += ".thumbnail.png";
  } else if (url.endsWith(".pdf")) {
    url += ".thumbnail.jpg";
  } else {
  }
  return url;
};

export const getSquaredThumbnails = ({
  docs,
  type,
  jwt,
  setIndex,
  setVisible,
  openLightBox = true,
}) => {
  if (docs === undefined) {
    console.trace();
    return null;
  }
  const rightDocs = docs.filter((doc) => doc.caption === type);

  const thumbnails = [];

  for (const doc of rightDocs) {
    let url = addDotThumbnail(getWebDavUrl(jwt, doc));
    let index = docs.indexOf(doc);
    thumbnails.push(
      <div style={{ width: "75px", height: "75px", overflow: "hidden", margin: "3px" }}>
        <img
          onClick={() => {
            if (openLightBox) {
              setIndex(index);
              setVisible(true);
            }
          }}
          alt=''
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          src={url}
        />
      </div>
    );
  }
  return <div style={{ display: "flex", flexDirection: "row" }}>{thumbnails}</div>;
};

export const collectEvents = (item, eventPath) => {};

export const getTimelineForActions = ({ actions }) => {
  if (actions.length > 0) {
    const sorted = actions.sort((a, b) => (a.id < b.id ? -1 : 1));

    return (
      <Timeline style={{ paddingTop: 10 }} mode={"left"}>
        {sorted.map((action, index) => {
          let dot, color;
          if (action[2] === "today") {
            dot = <FontAwesomeIcon icon={faBullseye} />;
            color = "green";
          } else if (action[2] === "M") {
            dot = <FontAwesomeIcon icon={faGripLinesVertical} />;
            color = "black";
          } else if (action[2] === "L") {
            dot = <FontAwesomeIcon className='fa-rotate-180' icon={faGlassMartini} />;
            color = "blue";
          }

          return (
            <Timeline.Item
              style={{ paddingBottom: 0 }}
              color={color}
              dot={dot}
              label={action.aenderung + (action.ir === true ? "*" : "")}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                }}
              >
                <div>
                  <b>{action.neu || "-"}</b>
                </div>
                <div style={{ color: "grey" }}>
                  <i>{action.alt}</i>
                </div>
              </div>
            </Timeline.Item>
          );
        })}
      </Timeline>
    );
  } else {
    return null;
  }
};

export const getTimelineForEvents = ({ events, includeToday = true }) => {
  let e;
  if (includeToday) {
    e = [...events, ["heute", new Date().toISOString(), "today"]];
  } else {
    e = events;
  }

  e = sortAndFilterEvents(e);
  if ((includeToday && e.length > 1) || (!includeToday && e.length > 0)) {
    return (
      <Timeline style={{ paddingTop: 10 }} mode={"left"}>
        {e.map((event, index) => {
          let dot, color;
          if (event[2] === "today") {
            dot = <FontAwesomeIcon icon={faBullseye} />;
            color = "green";
          } else if (event[2] === "M") {
            dot = <FontAwesomeIcon icon={faGripLinesVertical} />;
            color = "black";
          } else if (event[2] === "L") {
            dot = <FontAwesomeIcon className='fa-rotate-180' icon={faGlassMartini} />;
            color = "blue";
          }

          return (
            <Timeline.Item color={color} dot={dot} label={getDate(event[1].replace(" ", "T"))}>
              {event[0]}
            </Timeline.Item>
          );
        })}
      </Timeline>
    );
  } else {
    return null;
  }
};

export const clearOptionalDescriptionItems = (items) => {
  const cleared = [];
  for (const item of items) {
    if (item.props.optionalPredicate) {
      if (item.props.optionalPredicate()) {
        cleared.push(item);
      }
    } else if (item.props.children) {
      cleared.push(item);
    }
  }
  return cleared;
};

export const getAddImageButton = (dispatch, item, type, geometry) => {
  const artificialFeature = {
    featuretype: type,
    properties: item,
    geometry: geometry,
  };
  const vcard = getVCard(artificialFeature);

  return (
    <div>
      <IconLink
        key={`addPhoto`}
        tooltip={"Foto hinzufügen"}
        onClick={(e) => {
          e.stopPropagation();
          dispatch(
            showDialog(
              <AddImageDialog
                close={() => {
                  dispatch(showDialog());
                }}
                input={{ feature: artificialFeature, vcard }}
                onClose={(addImageParamater) => {
                  dispatch(addImageToObjectAction(addImageParamater));
                }}
              />
            )
          );
        }}
        iconname={"camera"}
      />
    </div>
  );
};
