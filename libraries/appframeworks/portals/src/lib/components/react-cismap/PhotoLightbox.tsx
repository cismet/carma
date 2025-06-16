import React, { useContext } from "react";
import Lightbox from "react-image-lightbox";
import "react-image-lightbox/style.css"; // This only needs to be imported once in your app
import {
  LightBoxContext,
  LightBoxDispatchContext,
} from "../../contexts/LightBoxContextProvider";

const Comp = ({ reactModalStyleOverride, defaultContextValues = {} }) => {
  const {
    title,
    photourls,
    caption,
    captions,
    index,
    visible,
    reactModalStyle,
  } = useContext(LightBoxContext) || defaultContextValues;
  const { setVisible, setIndex } =
    useContext(LightBoxDispatchContext) || defaultContextValues;

  if (visible) {
    let nextSrc = photourls[(index + 1) % photourls.length];
    let prevSrc = photourls[(index + photourls.length - 1) % photourls.length];

    if (photourls.length === 1) {
      nextSrc = null;
      prevSrc = null;
    }

    let _caption;

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
        onCloseRequest={() => setVisible(false)}
        onMovePrevRequest={() =>
          setIndex((index + photourls.length - 1) % photourls.length)
        }
        onMoveNextRequest={() => setIndex((index + 1) % photourls.length)}
        imageTitle={title}
        imageCaption={_caption}
        imagePadding={65}
        animationDuration={600}
      />
    );
  } else {
    return <div />;
  }
};
export default Comp;
