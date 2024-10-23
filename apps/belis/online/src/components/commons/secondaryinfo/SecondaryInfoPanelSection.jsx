import { Collapse } from "antd";
import React from "react";

const { Panel } = Collapse;
// Since this component is simple and static, there's no parent container for it.

//convert bootsrap bsStyle to antd color
const getColor = (bsStyle) => {
  switch (bsStyle) {
    case "primary":
      return {
        backgroundColor: "#217CB4",
        color: "#FFFFFF",
      };
    case "success":
      return {
        backgroundColor: "#DFF0DA",
        color: "#3B7742",
      };
    case "info":
      return {
        backgroundColor: "#D8EEF7",
        color: "#27718D",
      };
    case "warning":
      return {
        backgroundColor: "#FDF8E5",
        color: "#8C6C40",
      };
    case "danger":
      return {
        backgroundColor: "#F3DEDE",
        color: "#AC4143",
      };
    default:
      return {
        backgroundColor: "#F5F5F5",
        color: "#333333",
      };
  }
};

const Comp = ({
  header = "Header",
  bsStyle = "success",
  content,
  children,
  extra,
  collapsedOnStart = false,
}) => {
  const colors = getColor(bsStyle);
  return (
    <Collapse
      style={{ marginBottom: 6 }}
      defaultActiveKey={collapsedOnStart === false ? "X" : "Y"}
    >
      <Panel
        style={{ backgroundColor: colors.backgroundColor }}
        showArrow={false}
        header={
          <span style={{ color: colors.color, fontSize: "16px" }}>
            {header}
          </span>
        }
        key="X"
        extra={extra}
      >
        {content || children}
      </Panel>
    </Collapse>
  );
};

export default Comp;
