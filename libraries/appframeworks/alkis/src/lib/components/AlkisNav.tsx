import React, { ReactNode } from "react";
interface AlkisNavProps {
  children?: ReactNode;
  name: string;
  logoPath: string;
  style: React.CSSProperties;
}

export const AlkisNav = ({
  children,
  name,
  logoPath,
  style = { width: "28px" },
}: AlkisNavProps) => {
  return (
    <div className="w-full min-h-screen bg-[#f4f4f5]">
      <header className="flex items-center justify-between bg-white p-2 gap-3 py-[1.4rem]">
        <div className="flex items-center gap-3">
          <div className="flex gap-2 items-center h-full cursor-pointer">
            <img src={logoPath} alt="Logo" style={style} />
            <span>{name} - ALKIS Auskunft</span>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
};
