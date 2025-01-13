import { Card } from "antd";
import React, { ReactNode, CSSProperties } from "react";

interface CustomCardProps extends React.ComponentProps<typeof Card> {
  style?: CSSProperties;
  title?: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
  fullHeight?: boolean;
}

const CustomCard: React.FC<CustomCardProps> = ({
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

export default CustomCard;
