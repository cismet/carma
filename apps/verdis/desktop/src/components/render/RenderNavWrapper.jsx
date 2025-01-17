import React from "react";

const logoSrc = "/logo.svg";
const urlPrefix = window.location.origin + window.location.pathname;

const RenderNavWrapper = ({ children }) => {
  return (
    <div className="h-screen w-full">
      <header className="flex items-center justify-between bg-white p-2 gap-3 py-[1.4rem]">
        <div className="md:flex hidden items-center gap-3">
          <div className="flex gap-2 items-center h-full cursor-pointer">
            <img src={urlPrefix + logoSrc} alt="Logo" className="h-10" />
            <span class="font-semibold no-underline pt-1">VerDIS</span>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
};

export default RenderNavWrapper;
