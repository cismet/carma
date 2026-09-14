import { useContext, useEffect, useState, type ReactNode } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

/**
 * The `title` param of the hash query (`#/?lat=..&title` or `&title=Text`).
 * `undefined` when absent, `""` for the bare flag, else the custom text.
 * Same convention react-cismap's TitleBox and DefaultSettingsPanel use, so the
 * "Titel anzeigen" checkbox keeps working.
 */
const readTitleParam = (): string | undefined => {
  const query = window.location.hash.split("?", 2)[1];
  if (!query) {
    return undefined;
  }
  const params = new URLSearchParams(query);
  if (!params.has("title")) {
    return undefined;
  }
  return params.get("title") ?? "";
};

export const useHashTitleParam = () => {
  // react-cismap's hash history (history v5) writes via pushState, which fires
  // no hashchange; the settings checkbox toggles the flag through it, so we
  // listen on that history too.
  const { history } = useContext<typeof TopicMapContext>(TopicMapContext) ?? {};
  const [title, setTitle] = useState<string | undefined>(readTitleParam);
  useEffect(() => {
    const update = () => setTitle(readTitleParam());
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    const unlisten: (() => void) | undefined = history?.listen?.(update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
      unlisten?.();
    };
  }, [history]);
  return title;
};

/**
 * Title bar over the map, replacing react-cismap's TitleBox for MapLibre
 * topic maps. Shown while the hash carries `title`; a custom text there wins
 * over `title`. Pass `null` as `title` when there is nothing to say (e.g. no
 * active filter), the bar is then not rendered.
 */
export const MapTitleBox = ({ title }: { title: ReactNode | null }) => {
  const titleParam = useHashTitleParam();
  if (titleParam === undefined) {
    return null;
  }
  const content = titleParam !== "" ? titleParam : title;
  if (!content) {
    return null;
  }
  return (
    <div
      style={{
        position: "absolute",
        left: 54,
        right: 62,
        top: 12,
        height: 30,
        zIndex: 555,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        color: "black",
        opacity: 0.9,
        paddingLeft: 10,
        pointerEvents: "none",
      }}
    >
      {content}
    </div>
  );
};
