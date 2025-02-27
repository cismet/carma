import { useContext, useRef, useEffect, useCallback } from "react";
import { FolderApi, Pane, type FolderParams } from "tweakpane";
import { TweakpaneContext } from "../TweakpaneContext";

interface Input {
  label?: string;
  name: string;
  [key: string]: unknown;
}

export const useTweakpaneCtx = ({
  folder,
  params = {},
  inputs = [],
}: {
  folder?: FolderParams;
  params?: { [key: string]: unknown };
  inputs?: Input[];
} = {}) => {
  const context = useContext(TweakpaneContext);

  if (!context) {
    throw new Error("useTweakpane must be used within a TweakpaneProvider");
  }

  const { paneRef } = context;

  const folderRef = useRef<FolderApi | null>(null);

  useEffect(() => {
    let isSetup = false;

    const setupTweakpane = () => {
      if (!paneRef.current) return false;

      const isHidden = paneRef.current.element.parentElement?.hidden === true;
      if (isHidden) return false;

      if (folder) {
        if (folderRef.current) {
          folderRef.current.hidden = false;
          console.debug("HOOK: [TWEAKPANE|DEBUG] using existing folder");
        } else {
          console.debug("HOOK: [TWEAKPANE|DEBUG] adding new folder to pane");
          folderRef.current = paneRef.current.addFolder(folder);
        }

        if (folderRef.current.children.length > 0) {
          folderRef.current.children.forEach((child) => {
            child.dispose();
          });
        }

        inputs.forEach((input) => {
          folderRef.current &&
            folderRef.current.addBinding(params, input.name, input);
        });
      } else {
        console.debug(
          "[TWEAKPANE|DEBUG] Folder params not provided, using root folder"
        );

        inputs.forEach((input) => {
          paneRef.current &&
            paneRef.current.addBinding(params, input.name, input);
        });
      }

      return true;
    };

    isSetup = setupTweakpane();

    if (!isSetup) {
      const intervalId = setInterval(() => {
        isSetup = setupTweakpane();
        if (isSetup) {
          clearInterval(intervalId);
        }
      }, 500); // Check every 500ms

      return () => {
        clearInterval(intervalId);
      };
    }

    return () => {
      if (folderRef.current) {
        folderRef.current.hidden = true;
        folderRef.current.children.forEach((child) => {
          child.dispose();
        });
      }
    };
  }, [folder, params, inputs, paneRef]);

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
