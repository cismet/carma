/** Read baseline/progressive JPEG dimensions without creating a full decoded image. */
export const readJpegImageSize = async (blob: Blob, signal: AbortSignal) => {
  signal.throwIfAborted();
  const bytes = new Uint8Array(await blob.slice(0,Math.min(blob.size,1024*1024)).arrayBuffer());
  signal.throwIfAborted();
  if (bytes[0]!==255 || bytes[1]!==216) throw new Error("JPEG header missing");
  for (let at=2; at+4<bytes.length;) {
    if (bytes[at++]!==255) continue;
    while (bytes[at]===255) at++;
    const marker=bytes[at++];
    if (marker===0 || marker===216 || (marker>=208&&marker<=215)) continue;
    if (marker===217 || marker===218) break;
    const length=(bytes[at]<<8)|bytes[at+1];
    if (length<2 || at+length>bytes.length) break;
    if (marker>=192&&marker<=207&&marker!==196&&marker!==200&&marker!==204) {
      const height=(bytes[at+3]<<8)|bytes[at+4],width=(bytes[at+5]<<8)|bytes[at+6];
      if (width>0&&height>0) return {width,height};
    }
    at+=length;
  }
  throw new Error("JPEG dimensions unavailable in bounded header");
};
