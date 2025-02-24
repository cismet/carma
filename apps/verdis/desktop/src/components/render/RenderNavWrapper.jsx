import React from "react";

const logoSrc = "/logo.svg";
const urlPrefix = window.location.origin + window.location.pathname;

const RenderNavWrapper = ({ children }) => {
  return (
    <div className="w-full min-h-screen bg-[#f4f4f5]">
      <header className="flex items-center justify-between bg-white p-2 gap-3 py-[1.4rem]">
        <div className="flex items-center gap-3">
          <div className="flex gap-2 items-center h-full cursor-pointer">
            <img src={urlPrefix + logoSrc} alt="Logo" className="h-10" />
            <span class="font-semibold no-underline pt-1">
              VerDIS - ALKIS Auskunft
            </span>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
};

export default RenderNavWrapper;
