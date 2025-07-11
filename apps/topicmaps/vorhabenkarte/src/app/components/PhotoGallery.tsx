import React from "react";

const PhotoGallery = ({ photos, handleImgClick }) => {
  const MAX_DISPLAY = 4;
  const hasMore = photos.length > MAX_DISPLAY;
  const displayed = photos.slice(0, MAX_DISPLAY);
  const extraCount = photos.length - MAX_DISPLAY;
  const extraLabel = extraCount === 1 ? "weiteres Foto" : "weitere Fotos";

  return (
    <div className="py-[10px]">
      <b className="text-[16px]">Foto-Galerie:</b>
      <div className="grid grid-cols-3 sm:grid-cols-3 [@media(min-width:992px)]:grid-cols-5 gap-4 mt-3 justify-center">
        {displayed.map((photo, idx) => (
          <div key={idx} className="cursor-pointer w-full max-w-[150px]">
            <img
              onClick={() => handleImgClick(idx)}
              src={`https://wunda-geoportal-docs.cismet.de/vorhabenkarte/fotos/${photo.url}`}
              alt={photo.anzeige}
              className="w-full aspect-square object-cover"
            />
            <div className="mt-2 ml-1 text-sm">{photo.anzeige}</div>
          </div>
        ))}

        {hasMore && (
          <a
            className="cursor-pointer flex items-center pl-1"
            onClick={() => handleImgClick(MAX_DISPLAY)}
          >
            +{photos.length - MAX_DISPLAY} {extraLabel}
          </a>
        )}
      </div>
    </div>
  );
};

export default PhotoGallery;
