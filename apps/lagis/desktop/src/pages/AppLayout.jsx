import React, { useEffect, useState } from "react";
import SidebarMenu from "../components/navigation/SidebarMenu";
import UserBar from "../components/header/UserBar";
import FooterSection from "../components/navigation/FooterSection";
import { Outlet } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import useUrlSyncGemarkunFlurFlurstueckHook from "../hooks/useUrlSyncGemarkunFlurFlurstueckHook";
import { TAILWIND_CLASSNAMES_FULLSCREEN_FIXED } from "@carma-commons/utils";
import { MobileWarningMessage } from "@carma-mapping/components";
import { mobileInfo } from "@carma-collab/wuppertal/lagis-desktop";
const AppLayout = () => {
  const [urlParams, setUrlParams] = useSearchParams();
  const [parametersForLink, setParametersForLink] = useState();
  useUrlSyncGemarkunFlurFlurstueckHook();
  useEffect(() => {
    const fromUrl = {
      gem: urlParams.get("gem") || undefined,
      flur: urlParams.get("flur") || undefined,
      fstck: urlParams.get("fstck") || undefined,
    };
    if (
      fromUrl.gem !== parametersForLink?.gem ||
      fromUrl.flur !== parametersForLink?.flur ||
      fromUrl.fstck !== parametersForLink?.fstck
    ) {
      setParametersForLink(fromUrl);
    }
  }, [urlParams, parametersForLink]);
  return (
    <>
      <div
        style={{
          background: "#F1F1F1",
        }}
        // className="w-full overflow-clip adaptive-full-screen"
        className={`${TAILWIND_CLASSNAMES_FULLSCREEN_FIXED}`}
      >
        <div
          // className="flex h-[calc(100%-16px)]"
          className="flex h-full"
          style={{ paddingRight: "16px" }}
        >
          <div className="h-full">
            <SidebarMenu parametersForLink={parametersForLink} />
          </div>
          <div
            className="flex-1 w-[calc(100%-341px)] flex flex-col justify-between gap-2"
            style={{ paddingLeft: "16px" }}
          >
            <div
              className="h-[32px]"
              style={{
                // paddingTop: "8px"
                paddingTop: "max(8px, env(safe-area-inset-top))",
              }}
            >
              <UserBar />
            </div>

            <div
              className="h-[calc(100%-50px)] w-full"
              style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
            >
              <Outlet />
            </div>

            {/* <div className="h-[calc(1%-10px)]">
            <FooterSection />
          </div> */}
          </div>
        </div>
      </div>
      <MobileWarningMessage
        headerText={mobileInfo.headerText}
        bodyText={mobileInfo.bodyText}
        confirmButtonText={mobileInfo.confirmButtonText}
        isHardMode={mobileInfo.isHardMode}
        messageWidth={993}
      />
    </>
  );
};

export default AppLayout;
