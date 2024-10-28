import { useContext, useRef, useEffect } from "react";
import { FolderApi, Pane, type FolderParams } from "tweakpane";
import { TweakpaneContext } from "../TweakpaneContext";

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
  const folderRef = useRef<FolderApi | null>(null);
  const paneRef = useRef<Pane | null>(null);

  if (!context) {
    throw new Error("useTweakpane must be used within a TweakpaneProvider");
  }

  const pane = context.paneRef.current;

  useEffect(() => {
    if (!pane) return;
    if (folderParams) {
      if (folderRef.current) {
        folderRef.current.hidden = false;
        console.debug("HOOK: [TWEAKPANE|DEBUG] using existing folder");
      } else {
        console.debug("HOOK: [TWEAKPANE|DEBUG] adding new folder to pane");
        folderRef.current = pane.addFolder(folderParams);
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
      console.info("Folder params not provided, using root folder");
      paneRef.current = pane;
      inputs.forEach((input) => {
        paneRef.current &&
          paneRef.current.addBinding(params, input.name, input);
      });
      return () => {
        paneRef.current = null;
      };
    }
  }, [folderParams, params, inputs, pane]);

  const folderCallback = (fn: (folder: FolderApi) => void) => {
    if (folderRef.current) {
      fn(folderRef.current);
    } else {
      console.warn("Folder not initialized yet");
    }
  };

  const paneCallback = (fn: (pane: Pane) => void) => {
    if (paneRef.current) {
      fn(paneRef.current);
    } else {
      console.warn("Pane not initialized yet");
    }
  };

  return { folderRef, folderCallback, paneRef, paneCallback };
};
