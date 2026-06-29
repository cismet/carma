import localforage from "localforage";
import { createContext, useEffect, type CSSProperties, type ReactNode } from "react";
import { useImmer, type Updater } from "use-immer";
import { setFromLocalforage } from "./_helper";

// Ported from react-cismap src/lib/contexts/LightBoxContextProvider.js,
// converted to TS. Runtime behaviour is intentionally unchanged.

export interface LightBoxState {
  title: string;
  photourls: string[];
  caption: ReactNode;
  captions: ReactNode[];
  index: number;
  visible: boolean;
  reactModalStyle?: CSSProperties;
}

export interface LightBoxSetAllPayload {
  title: string;
  photourls: string[];
  caption: ReactNode;
  index: number;
  visible?: boolean;
}

export interface LightBoxDispatchValue {
  dispatch: Updater<LightBoxState>;
  setTitle: (x: string) => void;
  setPhotoUrls: (x: string[]) => void;
  setCaption: (x: ReactNode) => void;
  setCaptions: (x: ReactNode[]) => void;
  setIndex: (x: number) => void;
  setVisible: (x: boolean) => void;
  setAll: (all: LightBoxSetAllPayload) => void;
}

const StateContext = createContext<LightBoxState | undefined>(undefined);
const DispatchContext = createContext<LightBoxDispatchValue | undefined>(
  undefined
);

const defaultState: LightBoxState = {
  title: "",
  photourls: [],
  caption: "",
  captions: [],
  index: 0,
  visible: false,
};

export interface LightBoxContextProviderProps {
  children: ReactNode;
  enabled?: boolean;
  appKey?: string;
  persistenceSettings?: Record<string, string[]>;
}

const UIContextProvider = ({
  children,
  enabled = true,
  appKey,
  persistenceSettings,
}: LightBoxContextProviderProps) => {
  const [state, dispatch] = useImmer<LightBoxState>({ ...defaultState });
  const contextKey = "lightbox";
  const set = <K extends keyof LightBoxState>(prop: K, noTest?: boolean) => {
    return (x: LightBoxState[K]) => {
      dispatch((draft) => {
        if (
          noTest === true ||
          JSON.stringify(draft[prop]) !== JSON.stringify(x)
        ) {
          if (persistenceSettings?.[contextKey]?.includes(prop)) {
            localforage.setItem("@" + appKey + "." + contextKey + "." + prop, x);
          }
          draft[prop] = x;
        }
      });
    };
  };
  useEffect(() => {
    if (persistenceSettings && persistenceSettings[contextKey]) {
      for (const prop of persistenceSettings[contextKey]) {
        const localforagekey = "@" + appKey + "." + contextKey + "." + prop;
        const setter = set(prop as keyof LightBoxState, true) as (
          value: unknown
        ) => void;
        setFromLocalforage(localforagekey, setter);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setX = {
    setTitle: set("title"),
    setPhotoUrls: set("photourls"),
    setCaption: set("caption"),
    setCaptions: set("captions"),
    setIndex: set("index"),
    setVisible: set("visible"),
    setAll: (all: LightBoxSetAllPayload) => {
      dispatch((draft) => {
        draft.title = all.title;
        draft.photourls = all.photourls;
        draft.caption = all.caption;
        draft.index = all.index;
        draft.visible = all.visible === undefined ? true : all.visible;
      });
    },
  };

  if (enabled === true) {
    return (
      <StateContext.Provider value={state}>
        <DispatchContext.Provider
          value={{
            dispatch,
            ...setX,
          }}
        >
          {children}
        </DispatchContext.Provider>
      </StateContext.Provider>
    );
  } else {
    return (
      <StateContext.Provider value={undefined}>
        <DispatchContext.Provider value={undefined}>
          {children}
        </DispatchContext.Provider>
      </StateContext.Provider>
    );
  }
};

export default UIContextProvider;

export {
  StateContext as LightBoxContext,
  DispatchContext as LightBoxDispatchContext,
  UIContextProvider,
};
