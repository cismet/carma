// import { lazy, Suspense, useEffect, useState } from "react";
// import { Spin } from "antd";
// import { OBLIQUE_CONFIG } from "../config/oblique.config";
// import { obliqueEventBus } from "../utils/obliqueState";

// // Lazy load the new CesiumObliqueMode component that includes the scoped provider
// const LibraryCesiumObliqueMode = lazy(() =>
//   import("@carma-mapping/engines/cesium/oblique-mode").then((module) => ({
//     default: module.CesiumObliqueMode,
//   }))
// );

// /**
//  * Geoportal Cesium Oblique Mode component
//  * Wraps the library CesiumObliqueMode with app-specific config
//  * Syncs with app-level oblique state (for TopNavbar button)
//  *
//  * The library CesiumObliqueMode includes:
//  * - Toggle state management
//  * - Lazy loading of oblique code
//  * - Scoped ObliqueProvider (only active when mode is on)
//  * - Data loading and ObliqueControls rendering
//  */
// export const CesiumObliqueMode = () => {
//   const [isActive, setIsActive] = useState(false);

//   // Subscribe to app-level toggle events (from TopNavbar button)
//   useEffect(() => {
//     const unsubscribe = obliqueEventBus.subscribe("toggle", setIsActive);
//     return unsubscribe;
//   }, []);

//   // Don't load library until mode is active
//   if (!isActive) return null;

//   return (
//     <Suspense
//       fallback={
//         <div
//           style={{
//             position: "fixed",
//             top: "50%",
//             left: "50%",
//             transform: "translate(-50%, -50%)",
//             zIndex: 9999,
//           }}
//         >
//           <Spin size="large" tip="Lade Schrägluftbild-Modus..." />
//         </div>
//       }
//     >
//       <LibraryCesiumObliqueMode config={OBLIQUE_CONFIG} isActive={isActive} />
//     </Suspense>
//   );
// };

export const CesiumObliqueMode = () => null;
