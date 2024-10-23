export const shrinkBase64Image = async (
  base64Image,
  maxSide,
  quality,
  done,
  logDebug = false
) => {
  const img = document.createElement("img");
  img.onload = () => {
    const longestSide = Math.max(img.naturalWidth, img.naturalHeight);

    // set longest side to 1600 if it is longer
    let scale = 1;
    if (longestSide > maxSide) {
      scale = maxSide / longestSide;
    }
    if (logDebug) {
      console.log("shrinkBase64Image in", base64Image);
      console.log("shrinkBase64Image longestSide", longestSide);
      console.log("shrinkBase64Image scale", scale);
    }
    //now scale the image
    img.width = img.naturalWidth * scale;
    img.height = img.naturalHeight * scale;

    //now create a base64 image out of it
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, img.width, img.height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (logDebug) {
      console.log("shrinkBase64Image out", dataUrl);
    }
    done(dataUrl);
  };
  img.src = base64Image;
};
