import { useContext } from "react";
import Lightbox from "react-image-lightbox";
import "react-image-lightbox/style.css";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import {
  LightBoxContext,
  LightBoxDispatchContext,
} from "react-cismap/contexts/LightBoxContextProvider";

interface LightBoxContextValue {
  photourls?: string[];
  index?: number;
  visible?: boolean;
  reactModalStyle?: {
    overlay?: React.CSSProperties;
    content?: React.CSSProperties;
  };
}

interface LightBoxDispatchValue {
  setVisible?: (visible: boolean) => void;
  setIndex?: (index: number) => void;
}

interface PhotoLightboxProps {
  reactModalStyleOverride?: {
    overlay?: React.CSSProperties;
    content?: React.CSSProperties;
  };
  animationDuration?: number;
}

const PhotoLightbox = ({
  reactModalStyleOverride,
  animationDuration = 20,
}: PhotoLightboxProps) => {
  const context = useContext(LightBoxContext) as LightBoxContextValue | null;
  const dispatch = useContext(
    LightBoxDispatchContext
  ) as LightBoxDispatchValue | null;

  const { photourls, index = 0, visible, reactModalStyle } = context || {};
  const { setVisible, setIndex } = dispatch || {};

  if (!visible || !photourls || photourls.length === 0) {
    return null;
  }

  let nextSrc: string | undefined = photourls[(index + 1) % photourls.length];
  let prevSrc: string | undefined =
    photourls[(index + photourls.length - 1) % photourls.length];

  if (photourls.length === 1) {
    nextSrc = undefined;
    prevSrc = undefined;
  }

  return (
    <Lightbox
      reactModalStyle={reactModalStyleOverride || reactModalStyle}
      mainSrc={photourls[index]}
      nextSrc={nextSrc}
      prevSrc={prevSrc}
      onImageLoad={() => {
        window.dispatchEvent(new Event("resize"));
      }}
      onCloseRequest={() => setVisible?.(false)}
      onMovePrevRequest={() =>
        setIndex?.((index + photourls.length - 1) % photourls.length)
      }
      onMoveNextRequest={() => setIndex?.((index + 1) % photourls.length)}
      imagePadding={65}
      animationDuration={animationDuration}
    />
  );
};

export default PhotoLightbox;
