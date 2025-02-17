import React from "react";
import { Card } from "antd";

export const CustomCard = ({
  style,
  title,
  extra,
  children,
  fullHeight,
  ...props
}) => {
  return (
    <Card
      style={style}
      bodyStyle={{
        overflowY: "auto",
        maxHeight: fullHeight ? "100%" : "calc(100% - 40px)",
        overflowX: "clip",
        height: "100%",
      }}
      title={<span className="text-lg">{title}</span>}
      extra={extra}
      size="small"
      hoverable={false}
      {...props}
    >
      {children}
    </Card>
  );
};
