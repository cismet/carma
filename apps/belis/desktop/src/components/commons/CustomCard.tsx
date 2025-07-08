import React, { CSSProperties, ReactNode } from "react";
import { Card, CardProps } from "antd";

interface CustomCardProps extends CardProps {
  fullHeight?: boolean;
  title: ReactNode;
  extra?: ReactNode;
  style?: CSSProperties;
  children?: ReactNode;
}

export const CustomCard = ({
  style,
  title,
  extra,
  children,
  fullHeight,
  ...props
}: CustomCardProps) => {
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
