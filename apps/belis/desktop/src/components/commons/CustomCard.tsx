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
  // Check if using flex layout from style prop
  const isFlexLayout = style?.display === "flex";

  return (
    <Card
      style={style}
      bodyStyle={{
        overflow: isFlexLayout ? "hidden" : "auto",
        maxHeight: fullHeight ? "100%" : "calc(100% - 40px)",
        height: "100%",
        ...(isFlexLayout && {
          display: "flex",
          flexDirection: "column" as const,
        }),
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
