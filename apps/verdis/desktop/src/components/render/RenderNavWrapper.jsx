import React from "react";

const logoSrc = "/logo.svg";
const urlPrefix = window.location.origin + window.location.pathname;

const RenderNavWrapper = ({ children }) => {
  return (
    <div className="h-screen w-full">
      <header className="flex items-center justify-between bg-white p-2 gap-3 py-5">
        <div className="md:flex hidden items-center gap-3">
          <div className="flex gap-2 items-center h-full cursor-pointer">
            <img src={urlPrefix + logoSrc} alt="Logo" className="h-10" />
            <span>VerDIS</span>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
};

export default RenderNavWrapper;
