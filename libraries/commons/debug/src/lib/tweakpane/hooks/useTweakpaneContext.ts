import { useContext, useRef, useEffect, useCallback } from "react";
import { FolderApi, Pane, type FolderParams } from "tweakpane";
import { TweakpaneContext } from "../TweakpaneContext";
import { i } from "vitest/dist/reporters-yx5ZTtEV.js";

interface Input {
  label?: string;
  name: string;
  [key: string]: unknown;
}

export const useTweakpaneCtx = (
  folderParams?: FolderParams,
  params: { [key: string]: unknown } = {},
  inputs: Input[] = []
) => {
  const context = useContext(TweakpaneContext);

  if (!context) {
    throw new Error("useTweakpane must be used within a TweakpaneProvider");
  }

  const { paneRef } = context;

  const folderRef = useRef<FolderApi | null>(null);

  useEffect(() => {
    if (!paneRef.current) return;
    const isHidden = paneRef.current.element.parentElement?.hidden === true;
    if (isHidden) return;
    if (folderParams) {
      if (folderRef.current) {
        folderRef.current.hidden = false;
        console.debug("HOOK: [TWEAKPANE|DEBUG] using existing folder");
      } else {
        console.debug("HOOK: [TWEAKPANE|DEBUG] adding new folder to pane");
        folderRef.current = paneRef.current.addFolder(folderParams);
      }
      inputs.forEach((input) => {
        folderRef.current &&
          folderRef.current.addBinding(params, input.name, input);
      });

      return () => {
        if (folderRef.current) {
          // hide the folder, but keep it in the pane for reuse on rerender
          folderRef.current.hidden = true;
          // dispose of all children
          folderRef.current.children.forEach((child) => {
            child.dispose();
          });
        }
      };
    } else {
      console.debug(
        "[TWEAKPANE|DEBUG] Folder params not provided, using root folder"
      );
      inputs.forEach((input) => {
        paneRef.current &&
          paneRef.current.addBinding(params, input.name, input);
      });
    }
  }, [folderParams, params, inputs, paneRef]);

  const folderCallback = useCallback((fn: (folder: FolderApi) => void) => {
    if (folderRef.current) {
      fn(folderRef.current);
    } else {
      console.warn("Folder not initialized yet");
    }
  }, []);

  const paneCallback = useCallback(
    (fn: (pane: Pane) => void) => {
      if (paneRef.current) {
        fn(paneRef.current);
      } else {
        console.warn("Pane not initialized yet");
      }
    },
    [paneRef]
  );

  return { folderRef, folderCallback, paneRef, paneCallback };
};
