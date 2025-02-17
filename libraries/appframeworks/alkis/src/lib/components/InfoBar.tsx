import React, { ReactNode } from "react";

type InfoBarProps = {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
};

export const InfoBar = ({ title, children, className }: InfoBarProps) => {
  return (
    <div className="flex items-center justify-between w-full">
      <h4 className={`font-semibold text-lg m-0 ${className}`}>{title}</h4>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
};
