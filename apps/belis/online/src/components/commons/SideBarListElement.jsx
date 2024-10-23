import React from "react";
import ListGroup from "react-bootstrap/ListGroup";
import { useDispatch } from "react-redux";

import { getVCard } from "../../core/helper/featureHelper";
import { setSelectedFeature } from "../../core/store/slices/featureCollection";

//---------

const SideBarListElement = ({ feature, selected }) => {
  const dispatch = useDispatch();
  // const selectedFeature = useSelector(getSelectedFeature);
  let vcard = getVCard(feature);
  const style = selected ? { background: "lightgray" } : {};
  const debugColors = false;
  const oneRowEllipse = (
    <span>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "nowrap",
          gap: "10px",
          overflow: "hidden",
        }}
      >
        {/* first row (unselected) */}
        <span
          style={{
            flexBasis: "0%",
            flexGrow: "1",
            background: debugColors ? "red" : undefined,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ textAlign: "left" }}>
            <b>{vcard.list.main}</b>
          </span>
        </span>
        <span
          style={{
            flexBasis: "90%",
            flexGrow: "1",
            textAlign: "right",
            background: debugColors ? "green" : undefined,
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            overflow: "hidden",
          }}
        >
          {vcard.list.upperright}
        </span>
      </div>
      {/* second row (unselected)*/}
      <div style={{ position: "relative", bottom: "0px", textAlign: "left" }}>
        <span
          style={{
            clear: "left",
            float: vcard.list.lowerright ? "left" : "none", //ugly winning: this works for the taslist but not for the objects (atm there is no lowerright info there)
            display: "block",
            background: debugColors ? "yellow" : undefined,
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            overflow: "hidden",
          }}
        >
          {vcard.list.subtitle}
        </span>
        {vcard.list.lowerright && (
          <span style={{ float: "right", background: debugColors ? "blue" : undefined }}>
            {vcard.list.lowerright}
          </span>
        )}
      </div>
    </span>
  );
  const lineBreak = (
    <span>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "nowrap",
          gap: "10px",
          overflow: "hidden",
        }}
      >
        {/* first row (selected) */}
        <span
          style={{
            flexBasis: "0%",
            flexGrow: "1",
            background: debugColors ? "red" : undefined,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ textAlign: "left" }}>
            <b>{vcard.list.main}</b>
          </span>
        </span>
        <span
          style={{
            flexBasis: "90%",
            flexGrow: "1",
            textAlign: "right",
            background: debugColors ? "green" : undefined,
            overflowWrap: "anywhere",
          }}
        >
          {vcard.list.upperright}
        </span>
      </div>
      {/* second row (selected) */}
      <div style={{ position: "relative", bottom: "0px", textAlign: "left" }}>
        <span
          style={{
            float: "left",
            display: "block",
            background: debugColors ? "yellow" : undefined,
          }}
        >
          {vcard.list.subtitle}
        </span>
        <span
          style={{ clear: "right", float: "right", background: debugColors ? "blue" : undefined }}
        >
          {vcard.list.lowerright}
        </span>
      </div>
    </span>
  );

  const marquee = (
    <span>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "nowrap",
          gap: "10px",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            flexBasis: "0%",
            flexGrow: "1",
            background: debugColors ? "red" : undefined,
            whiteSpace: "nowrap",
          }}
        >
          <p style={{ textAlign: "left" }}>
            <b>{vcard.list.main}</b>
          </p>
        </span>
        {/* <span style={{ flexBasis: "90%", flexGrow: "1" , textAlign: "right", background: "green", margin: "0 auto", whiteSpace: "nowrap", overflow: "hidden", boxSizing: "border-box"  }}>
                          <span style={{display: "inline-block", paddingLeft: "100%", animation: "marquee 15s linear infinite", webkitAnimation: "marquee 15s linear infinite"}}>{vcard.list.upperright}</span> */}
        <span
          class={
            vcard.list.upperright &&
            vcard.list.main &&
            vcard.list.upperright.length > 27 - vcard.list.main.length
              ? "marquee"
              : ""
          }
          style={{
            flexBasis: "90%",
            flexGrow: "1",
            textAlign: "right",
            background: "green",
            margin: "0 auto",
            whiteSpace: "nowrap",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          <span>{vcard.list.upperright}</span>
        </span>
      </div>
      <div style={{ position: "relative", bottom: "0px", textAlign: "left" }}>
        <span
          style={{
            float: "left",
            display: "block",
            background: debugColors ? "yellow" : undefined,
          }}
        >
          {vcard.list.subtitle}
        </span>
        <span style={{ float: "right", background: debugColors ? "blue" : undefined }}>
          {vcard.list.lowerright}
        </span>
      </div>
    </span>
  );

  return (
    <>
      <ListGroup.Item
        style={{ ...style, padding: 7, overflow: "auto" }}
        onClick={() => {
          dispatch(setSelectedFeature(feature));
        }}
      >
        {!selected && oneRowEllipse}
        {selected && lineBreak}
        {/* {marquee} */}
        {/* <div style={{ position: "relative", bottom: "0px", textAlign: "left" }}>
          {vcard.list.subtitle}
        </div> */}
      </ListGroup.Item>
    </>
  );
};
export default SideBarListElement;
