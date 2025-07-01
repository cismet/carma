import React from "react";

const PhotoGallery = ({ photos, handleImgClick }) => {
  const MAX_DISPLAY = 5;
  const hasMore = photos.length > MAX_DISPLAY;
  const displayed = photos.slice(0, MAX_DISPLAY);

  return (
    <div className="py-[10px]">
      <b className="text-[16px]">Foto-Galerie:</b>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-3 justify-center">
        {displayed.map((photo, idx) => (
          <div key={idx} className="cursor-pointer w-full max-w-[150px]">
            <img
              onClick={() => handleImgClick(idx)}
              src={`https://wunda-geoportal-docs.cismet.de/vorhabenkarte/fotos/${photo.url}`}
              alt={photo.anzeige}
              className="w-full h-auto object-cover"
            />
            <div className="mt-2 ml-1 text-sm">{photo.anzeige}</div>
          </div>
        ))}

        {hasMore && (
          <div
            className="cursor-pointer w-full max-w-[150px] flex items-center justify-center bg-gray-100 text-gray-600 text-sm font-medium h-[150px]"
            onClick={() => handleImgClick(0)}
          >
            +{photos.length - MAX_DISPLAY} more
          </div>
        )}
      </div>

      {hasMore && (
        <div className="mt-4">
          <button
            onClick={() => handleImgClick(0)}
            className="text-blue-600 hover:underline"
          >
            See all photos
          </button>
        </div>
      )}
    </div>
  );
};

export default PhotoGallery;
