import React from "react";

const logoSrc = "/logo.png";
const urlPrefix = window.location.origin + window.location.pathname;

const RenderNavWrapper = ({ children }) => {
  return (
    <div className="w-full min-h-screen bg-[#f4f4f5]">
      <header className="flex items-center justify-between bg-white p-3 gap-3 py-[1.4rem]">
        <div className="flex items-center gap-3">
          <div className="flex flex-wrap justify-center items-center gap-1">
            <img
              src={urlPrefix + logoSrc}
              alt="LagIS-online"
              style={{ width: "28px" }}
            />
            <span>LagIS-online - ALKIS Auskunft</span>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
};

export default RenderNavWrapper;
