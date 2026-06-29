import { useContext, type CSSProperties, type ReactNode } from "react";
import Lightbox from "react-image-lightbox";
import "react-image-lightbox/style.css"; // This only needs to be imported once in your app
import {
  LightBoxContext,
  LightBoxDispatchContext,
  type LightBoxDispatchValue,
  type LightBoxState,
} from "./LightBoxContextProvider";

// Ported from react-cismap src/lib/topicmaps/PhotoLightbox.js (unchanged
// behaviour). Renders nothing while visible === false, so it is safe to mount
// idle wherever the map shell lives.

export interface PhotoLightBoxProps {
  reactModalStyleOverride?: CSSProperties;
  defaultContextValues?: Partial<LightBoxState & LightBoxDispatchValue>;
}

const PhotoLightBox = ({
  reactModalStyleOverride,
  defaultContextValues = {},
}: PhotoLightBoxProps) => {
  const state = useContext(LightBoxContext) ?? defaultContextValues;
  const dispatchContext =
    useContext(LightBoxDispatchContext) ?? defaultContextValues;
  const {
    title,
    photourls = [],
    caption,
    captions,
    index = 0,
    visible,
    reactModalStyle,
  } = state;
  const { setVisible, setIndex } = dispatchContext;

  if (visible) {
    let nextSrc: string | undefined = photourls[(index + 1) % photourls.length];
    let prevSrc: string | undefined =
      photourls[(index + photourls.length - 1) % photourls.length];

    if (photourls.length === 1) {
      nextSrc = undefined;
      prevSrc = undefined;
    }

    let _caption: ReactNode;

    if (captions && captions.length > 0) {
      try {
        _caption = captions[index];
      } catch (e) {
        _caption = caption;
      }
    } else {
      _caption = caption;
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
        imageTitle={title}
        imageCaption={_caption as string}
        imagePadding={65}
        animationDuration={600}
      />
    );
  } else {
    return <div />;
  }
};

export default PhotoLightBox;
