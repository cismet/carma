/** Shared by the receiver and its background quad; texture inputs use sRGB color space. */
export const MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER = /* glsl */ `
uniform sampler2D carmaScreenTexture0;
uniform mat3 carmaScreenToTexture0;
uniform float carmaScreenOpacity0;
uniform mat4 carmaScreenSceneToTexture0;
uniform float carmaScreenProjective0;
uniform sampler2D carmaScreenTexture1;
uniform mat3 carmaScreenToTexture1;
uniform float carmaScreenOpacity1;
uniform mat4 carmaScreenSceneToTexture1;
uniform float carmaScreenProjective1;
uniform float carmaScreenBasemapLabels;
uniform vec3 carmaScreenBackdropLook;
uniform vec4 carmaScreenBackdropTint;
uniform float carmaScreenBackdropOpacity;
uniform mat3 carmaScreenToBorderImage;
uniform vec2 carmaScreenBorderImageSize;
uniform vec4 carmaScreenBorderStyle;
vec4 carmaScreenSample(sampler2D image, mat3 transform, float opacity, vec2 uv) {
  vec3 projected = transform * vec3(uv, 1.0);
  vec2 imageUv = projected.xy/projected.z;
  if (opacity <= 0.0 || any(lessThan(imageUv,vec2(0.0))) || any(greaterThan(imageUv,vec2(1.0)))) return vec4(0.0);
  vec4 pixel = texture2D(image, imageUv);
  pixel.a *= opacity;
  return pixel;
}
// Integral of a unit Gaussian, used to blur the whole rectangle rather than
// individual edges. CSS box-shadow's blur radius corresponds to twice sigma.
vec2 carmaScreenGaussianIntegral(vec2 position, float sigma) {
  vec2 x = position / (max(sigma,0.0001)*1.4142135624);
  vec2 t = 1.0/(1.0+0.47047*abs(x));
  vec2 erf = 1.0-exp(-x*x)*t*(0.3480242+t*(-0.0958798+t*0.7478556));
  return 0.5+0.5*sign(x)*erf;
}
float carmaScreenBorder(vec2 uv) {
  if (carmaScreenBorderStyle.y<=0.0 && carmaScreenBorderStyle.w<=0.0) return 0.0;
  vec3 projected = carmaScreenToBorderImage*vec3(uv,1.0);
  vec2 imageUv = projected.xy/projected.z;
  vec2 position = (imageUv-0.5)*carmaScreenBorderImageSize;
  vec2 halfSize = carmaScreenBorderImageSize*0.5;
  vec2 delta = abs(position)-halfSize;
  float edge = max(delta.x,delta.y);
  float antialias = max(fwidth(edge)*0.5,0.0001);
  // The outside frame cannot contribute within the photograph. Compute its
  // derivative before branching, then skip Gaussian work for interior pixels.
  if (edge<=-antialias) return 0.0;
  float outside = smoothstep(-antialias,antialias,edge);
  float line = carmaScreenBorderStyle.x>0.0 ?
    outside*(1.0-smoothstep(carmaScreenBorderStyle.x-antialias,
                           carmaScreenBorderStyle.x+antialias,edge)) : 0.0;
  float borderAlpha = line*carmaScreenBorderStyle.y;
  float shadowAlpha = 0.0;
  if (carmaScreenBorderStyle.z>0.0) {
    // Blur the outer border box, matching the CSS shadow of a bordered image.
    vec2 shadowHalfSize = halfSize+max(carmaScreenBorderStyle.x,0.0);
    vec2 coverage = carmaScreenGaussianIntegral(position+shadowHalfSize,carmaScreenBorderStyle.z*0.5)
                   -carmaScreenGaussianIntegral(position-shadowHalfSize,carmaScreenBorderStyle.z*0.5);
    float shadowOutside = smoothstep(carmaScreenBorderStyle.x-antialias,
                                     carmaScreenBorderStyle.x+antialias,edge);
    shadowAlpha = clamp(coverage.x*coverage.y,0.0,1.0)*shadowOutside*carmaScreenBorderStyle.w;
  }
  return borderAlpha+shadowAlpha*(1.0-borderAlpha);
}
vec4 carmaScreenImages(vec2 uv, out float photographAlpha, out float decorationAlpha) {
  vec4 base = carmaScreenSample(carmaScreenTexture0,carmaScreenToTexture0,carmaScreenOpacity0*(1.0-carmaScreenProjective0),uv);
  vec4 crop = carmaScreenSample(carmaScreenTexture1,carmaScreenToTexture1,carmaScreenOpacity1*(1.0-carmaScreenProjective1),uv);
  photographAlpha = crop.a + base.a * (1.0-crop.a);
  decorationAlpha = carmaScreenBorder(uv);
  float borderAlpha = decorationAlpha*(1.0-photographAlpha);
  float alpha = photographAlpha+borderAlpha;
  return vec4((crop.rgb*crop.a + base.rgb*base.a*(1.0-crop.a)+vec3(borderAlpha))/max(alpha,0.00001),alpha);
}
vec4 carmaScreenProjectiveSample(sampler2D image, mat4 transform, float weight, vec3 position) {
  if (weight <= 0.0) return vec4(0.0);
  vec4 photo = transform * vec4(position,1.0);
  if (photo.w <= 0.0) return vec4(0.0);
  vec2 uv = photo.xy/photo.w;
  if (any(lessThan(uv,vec2(0.0))) || any(greaterThan(uv,vec2(1.0)))) return vec4(0.0);
  vec4 pixel = texture2D(image,uv);
  pixel.a *= weight;
  return pixel;
}
vec4 carmaReceiverImages(vec2 uv, vec3 position, out float photographAlpha, out float decorationAlpha) {
#ifdef CARMA_MAP_STYLE_PHOTO_ONLY
  photographAlpha = 0.0;
  decorationAlpha = 0.0;
  vec4 screen = vec4(0.0);
#else
  vec4 screen = carmaScreenImages(uv,photographAlpha,decorationAlpha);
#endif
#if defined(CARMA_PROJECTIVE_LOCAL_FRAME) && (defined(CARMA_MAP_STYLE_OVERLAY) || defined(CARMA_MAP_STYLE_PHOTO_ONLY))
  // These are the existing visible ECEF meshes. No receiver proxy or DEM is
  // introduced. Three's sRGB texture sampling supplies linear photo values.
  vec4 source = carmaScreenProjectiveSample(carmaScreenTexture0,carmaScreenSceneToTexture0,
    carmaScreenOpacity0*carmaScreenProjective0,position);
  vec4 target = carmaScreenProjectiveSample(carmaScreenTexture1,carmaScreenSceneToTexture1,
    carmaScreenOpacity1*carmaScreenProjective1,position);
  float weight = source.a+target.a;
  float alpha = min(1.0,weight);
  // A weighted sum keeps source*(1-t)+target*t at full coverage where both
  // cameras see the receiver. Serial alpha-over would dim the mesh at t=0.5.
  vec3 color = (source.rgb*source.a+target.rgb*target.a)/max(weight,0.00001);
  photographAlpha = alpha+photographAlpha*(1.0-alpha);
  decorationAlpha *= 1.0-alpha;
  float combinedAlpha = alpha+screen.a*(1.0-alpha);
  return vec4((color*alpha+screen.rgb*screen.a*(1.0-alpha))/max(combinedAlpha,0.00001),combinedAlpha);
#else
  return screen;
#endif
}
`;

export const MAP_STYLE_PROJECTION_VERTEX_HEADER = /* glsl */ `
uniform mat4 carmaMapStyleSceneToClip;
varying vec4 vCarmaMapStyleClip;
varying vec3 vCarmaReceiverPosition;
uniform mat4 carmaSurfaceSceneToTexture;
uniform mat4 carmaSurfacePreviousSceneToTexture;
varying vec2 vCarmaSurfaceUv;
varying vec2 vCarmaSurfacePreviousUv;
`;

export const MAP_STYLE_PROJECTION_VERTEX_BODY = /* glsl */ `
#include <project_vertex>
vec4 carmaSurfacePosition = modelMatrix * vec4( transformed, 1.0 );
vCarmaReceiverPosition = carmaSurfacePosition.xyz;
vCarmaMapStyleClip = carmaMapStyleSceneToClip * carmaSurfacePosition;
vCarmaSurfaceUv = (carmaSurfaceSceneToTexture * carmaSurfacePosition).xy;
vCarmaSurfacePreviousUv = (carmaSurfacePreviousSceneToTexture * carmaSurfacePosition).xy;
`;

export const MAP_STYLE_PROJECTION_FRAGMENT_HEADER =
  MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER +
  /* glsl */ `
// Two receiver-frame projective matrices and three style/label texels per camera.
// Only one receiver-position varying and one ~6 KB table, even with 32 trails.
uniform sampler2D carmaProjectiveData;
uniform sampler2D carmaProjectiveLabelAtlas;
uniform float carmaProjectiveCount;
uniform float carmaProjectiveTime;
uniform vec3 carmaProjectiveTrailColor;
uniform float carmaProjectiveTrailDuration;
uniform float carmaProjectiveOpacity;
uniform float carmaProjectivePixelRatio;
varying vec3 vCarmaReceiverPosition;
vec4 carmaProjectiveEntry(float row, float column) {
  return texture2D(carmaProjectiveData, vec2((column+0.5)/11.0,(row+0.5)/34.0));
}
float carmaProjectiveSegmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 direction = b-a;
  float t = clamp(dot(p-a,direction)/max(dot(direction,direction),0.000001),0.0,1.0);
  return length(p-a-direction*t);
}
vec4 carmaProjectiveMarkings() {
  vec4 result = vec4(0.0);
  if (carmaProjectiveCount <= 0.0 || carmaProjectiveOpacity <= 0.0) return result;
  for (int index=0; index<34; index++) {
    if (float(index)>=carmaProjectiveCount) break;
    float row = float(index);
#ifdef CARMA_PROJECTIVE_LOCAL_FRAME
    const float matrixColumn = 0.0;
#else
    const float matrixColumn = 4.0;
#endif
    mat4 projection = mat4(carmaProjectiveEntry(row,matrixColumn),carmaProjectiveEntry(row,matrixColumn+1.0),
                           carmaProjectiveEntry(row,matrixColumn+2.0),carmaProjectiveEntry(row,matrixColumn+3.0));
    vec4 photo = projection * vec4(vCarmaReceiverPosition,1.0);
    if (photo.w <= 0.0) continue;
    vec4 shapeStyle = carmaProjectiveEntry(row,9.0);
    if (shapeStyle.w > 1.5) {
      // The unit-sphere zero contour is the exact sphere/receiver intersection.
      float sphereDistance = length(photo.xyz/photo.w)-1.0;
      float derivative = max(fwidth(sphereDistance),0.0000001);
      float halfWidth = shapeStyle.x*carmaProjectivePixelRatio*0.5;
      float line = 1.0-smoothstep(max(0.0,halfWidth-0.75),halfWidth+0.75,abs(sphereDistance)/derivative);
      vec4 color = carmaProjectiveEntry(row,8.0);
      float alpha = line*color.a*carmaProjectiveOpacity;
      result.rgb = color.rgb*alpha+result.rgb*(1.0-alpha);
      result.a = alpha+result.a*(1.0-alpha);
      continue;
    }
    vec2 uv = photo.xy/photo.w;
    vec2 derivative = max(fwidth(uv),vec2(0.0000001));
    vec4 style = carmaProjectiveEntry(row,9.0);
    float halfWidth = style.x * carmaProjectivePixelRatio * 0.5;
    vec2 margin = derivative * (halfWidth+1.0);
    if (any(lessThan(uv,-margin)) || any(greaterThan(uv,vec2(1.0)+margin))) continue;
    vec4 color = carmaProjectiveEntry(row,8.0);
    float fade = style.z>=0.0 ? clamp((carmaProjectiveTime-style.z)/carmaProjectiveTrailDuration,0.0,1.0) : 0.0;
    if (fade>=1.0) continue;
    color.rgb = mix(color.rgb,carmaProjectiveTrailColor,fade);
    color.a *= 1.0-fade;
    vec2 edge = min(abs(uv),abs(vec2(1.0)-uv))/derivative;
    float distanceToLine = min(edge.x,edge.y);
    // Open 120-degree caret in photo UV, pointing towards image-up.
    if (style.w < 0.5) distanceToLine = min(distanceToLine,
      min(carmaProjectiveSegmentDistance(uv/derivative,vec2(0.465,0.045)/derivative,vec2(0.5,0.065)/derivative),
          carmaProjectiveSegmentDistance(uv/derivative,vec2(0.535,0.045)/derivative,vec2(0.5,0.065)/derivative)));
    float line = 1.0-smoothstep(max(0.0,halfWidth-0.75),halfWidth+0.75,distanceToLine);
    bool inside = all(greaterThanEqual(uv,vec2(0.0))) && all(lessThanEqual(uv,vec2(1.0)));
    float coverage = max(line,inside ? style.y : 0.0);
    vec4 cell = carmaProjectiveEntry(row,10.0);
    vec2 labelUv = (uv-vec2(0.3125,0.4125))/vec2(0.375,0.175);
    if (cell.z>0.0 && cell.w>0.0 && all(greaterThanEqual(labelUv,vec2(0.0))) && all(lessThanEqual(labelUv,vec2(1.0)))) {
      coverage = max(coverage,0.5*texture2D(carmaProjectiveLabelAtlas,cell.xy+labelUv*cell.zw).a);
    }
    float alpha = coverage*color.a*carmaProjectiveOpacity;
    result.rgb = color.rgb*alpha+result.rgb*(1.0-alpha);
    result.a = alpha+result.a*(1.0-alpha);
  }
  return result;
}

uniform sampler2D carmaMapStyleTexture;
uniform float carmaMapStyleEnabled;
uniform sampler2D carmaMapStyleDepthTexture;
uniform float carmaMapStyleDepthEnabled;
uniform vec2 carmaMapStyleDepthNearFar;
uniform vec2 carmaMapStyleTexelSize;
varying vec4 vCarmaMapStyleClip;
varying vec2 vCarmaSurfaceUv;
uniform sampler2D carmaSurfaceTexture;
uniform float carmaSurfaceOpacity;
uniform sampler2D carmaSurfacePreviousTexture;
uniform float carmaSurfacePreviousEnabled;
uniform float carmaSurfacePreviousOpacity;
uniform float carmaSurfaceTransition;
varying vec2 vCarmaSurfacePreviousUv;
#ifdef CARMA_MAP_STYLE_OVERLAY
// Draped label picked up in map_fragment, composited after lighting.
float carmaMapStyleLabelCoverage = 0.0;
vec3 carmaMapStyleLabelColor = vec3( 0.0 );
#endif

// MapLibre packs the DEM depth (clip z / w) into RGBA8, see terrain_depth.fragment.
float carmaMapStyleUnpackDepth( vec4 packed ) {
  return dot( packed, vec4( 1.0 / 16777216.0, 1.0 / 65536.0, 1.0 / 256.0, 1.0 ) );
}

float carmaMapStyleLinearDepth( float ndcZ ) {
  float near = carmaMapStyleDepthNearFar.x;
  float far = carmaMapStyleDepthNearFar.y;
  return 2.0 * near * far / ( far + near - ndcZ * ( far - near ) );
}

bool carmaMapStyleMatchesReceiver( vec2 uv ) {
  if ( carmaMapStyleDepthEnabled < 0.5 ) return true;
  float groundZ = carmaMapStyleUnpackDepth( texture2D( carmaMapStyleDepthTexture, uv ) );
  if ( groundZ <= 0.0 ) return false;
#ifndef CARMA_MAP_STYLE_OVERLAY
  // Terrain owns the visible surface; MapLibre only supplies its color.
  // Its independent DEM tessellation/depth must not mask that color where
  // Three uses another LOD or DSM. Keep depth-less capture gap repair below,
  // but reserve surface-depth matching for labels projected onto meshes.
  return true;
#else
  float fragmentZ = vCarmaMapStyleClip.z / vCarmaMapStyleClip.w;
  float groundDistance = carmaMapStyleLinearDepth( groundZ );
  float fragmentDistance = carmaMapStyleLinearDepth( fragmentZ );
  float tolerance = max( 2.0, 0.005 * groundDistance );
  return abs( fragmentDistance - groundDistance ) <= tolerance;
#endif
}

vec4 carmaMapStyleSampleGround( vec2 uv ) {
  vec4 sampleColor = texture2D( carmaMapStyleTexture, uv );
  if ( carmaMapStyleMatchesReceiver( uv ) ) return sampleColor;

  // MapLibre terrain without skirts can leave a one-to-few-pixel gap between
  // independently tessellated DEM tiles. Fill only those depth-less pixels
  // from the nearest ground sample so the captured style cannot paint the
  // framebuffer background as a dark seam onto the continuous Three terrain.
  vec2 texel = carmaMapStyleTexelSize;
  vec2 offsets[16];
  offsets[0] = vec2( 2.0, 0.0 );
  offsets[1] = vec2( -2.0, 0.0 );
  offsets[2] = vec2( 0.0, 2.0 );
  offsets[3] = vec2( 0.0, -2.0 );
  offsets[4] = vec2( 2.0, 2.0 );
  offsets[5] = vec2( -2.0, 2.0 );
  offsets[6] = vec2( 2.0, -2.0 );
  offsets[7] = vec2( -2.0, -2.0 );
  offsets[8] = vec2( 8.0, 0.0 );
  offsets[9] = vec2( -8.0, 0.0 );
  offsets[10] = vec2( 0.0, 8.0 );
  offsets[11] = vec2( 0.0, -8.0 );
  offsets[12] = vec2( 8.0, 8.0 );
  offsets[13] = vec2( -8.0, 8.0 );
  offsets[14] = vec2( 8.0, -8.0 );
  offsets[15] = vec2( -8.0, -8.0 );
  for ( int index = 0; index < 16; index++ ) {
    vec2 candidateUv = clamp( uv + offsets[index] * texel, vec2( 0.0 ), vec2( 1.0 ) );
    if ( carmaMapStyleMatchesReceiver( candidateUv ) ) {
      return texture2D( carmaMapStyleTexture, candidateUv );
    }
  }
  return vec4( 0.0 );
}

// The screen projection paints every surface along the view ray. A label
// drawn on the DEM ground belongs only to mesh surfaces at that ground: a
// roof or facade nearer to the camera than the DEM at the same pixel stays
// clean, so the label reads as baked on the street and occluded by buildings.
bool carmaMapStyleOccludedByMesh( vec2 uv ) {
  if ( carmaMapStyleDepthEnabled < 0.5 ) return false;
  float groundZ = carmaMapStyleUnpackDepth( texture2D( carmaMapStyleDepthTexture, uv ) );
  if ( groundZ <= 0.0 ) return false;
  float fragmentZ = vCarmaMapStyleClip.z / vCarmaMapStyleClip.w;
  float groundDistance = carmaMapStyleLinearDepth( groundZ );
  float fragmentDistance = carmaMapStyleLinearDepth( fragmentZ );
  float tolerance = max( 1.5, 0.02 * groundDistance );
  return fragmentDistance < groundDistance - tolerance;
}

vec3 carmaMapStyleSRGBToLinear( vec3 value ) {
  return mix(
    pow( value * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ),
    value * 0.0773993808,
    vec3( lessThanEqual( value, vec3( 0.04045 ) ) )
  );
}

vec3 carmaMapStyleLinearToSRGB( vec3 value ) {
  value = max(value,vec3(0.0));
  return mix(value*12.92,1.055*pow(value,vec3(1.0/2.4))-vec3(0.055),
             vec3(greaterThan(value,vec3(0.0031308))));
}

// Legacy CSS backdrop filters operate on display sRGB, in this exact order.
vec3 carmaScreenBackdrop( vec3 linearColor ) {
  vec3 value = carmaMapStyleLinearToSRGB(linearColor);
  value = clamp((value-vec3(0.5))*carmaScreenBackdropLook.x+vec3(0.5),0.0,1.0);
  value = clamp(value*carmaScreenBackdropLook.y,0.0,1.0);
  float grey = dot(value,vec3(0.213,0.715,0.072));
  value = clamp(mix(vec3(grey),value,carmaScreenBackdropLook.z),0.0,1.0);
  value = mix(value,carmaScreenBackdropTint.rgb,carmaScreenBackdropTint.a);
  return carmaMapStyleSRGBToLinear(value);
}
`;

export const MAP_STYLE_PROJECTION_FRAGMENT_OUTPUT = /* glsl */ `
#ifdef CARMA_MAP_STYLE_PHOTO_ONLY
// Preserve roofs/facades that the basemap receiver filter excludes. Only the
// two calibrated photographs participate; normal screen photos, labels and
// footprint/surface markings keep their existing receiver admission policy.
if (carmaScreenOpacity0 > 0.0 || carmaScreenOpacity1 > 0.0) {
  float photographAlpha;
  float decorationAlpha;
  vec4 image = carmaReceiverImages(vec2(0.0),vCarmaReceiverPosition,photographAlpha,decorationAlpha);
  outgoingLight = outgoingLight*(1.0-photographAlpha)+image.rgb*photographAlpha;
}
#include <opaque_fragment>
#else
#ifdef CARMA_MAP_STYLE_MARKINGS_ONLY
// Accumulate premultiplied overlays without the receiver's ground or lighting.
vec4 carmaMarkings = vec4(0.0);
if (carmaSurfaceOpacity > 0.0) {
  vec4 current = vec4(0.0);
  vec4 previous = vec4(0.0);
  if (all(greaterThanEqual(vCarmaSurfaceUv, vec2(0.0))) &&
      all(lessThanEqual(vCarmaSurfaceUv, vec2(1.0))))
    current = texture2D(carmaSurfaceTexture, vCarmaSurfaceUv);
  if (carmaSurfacePreviousEnabled > 0.5 &&
      all(greaterThanEqual(vCarmaSurfacePreviousUv, vec2(0.0))) &&
      all(lessThanEqual(vCarmaSurfacePreviousUv, vec2(1.0))))
    previous = texture2D(carmaSurfacePreviousTexture, vCarmaSurfacePreviousUv);
  float alpha = mix(previous.a, current.a, carmaSurfaceTransition);
  vec3 color = mix(carmaMapStyleSRGBToLinear(previous.rgb) * previous.a,
                  carmaMapStyleSRGBToLinear(current.rgb) * current.a,
                  carmaSurfaceTransition);
  if (carmaSurfacePreviousOpacity >= 0.0) {
    float trailAlpha = previous.a * carmaSurfacePreviousOpacity;
    alpha = current.a + trailAlpha * (1.0-current.a);
    color = carmaMapStyleSRGBToLinear(current.rgb) * current.a +
            carmaMapStyleSRGBToLinear(previous.rgb) * trailAlpha * (1.0-current.a);
  }
  carmaMarkings = vec4(color * carmaSurfaceOpacity, alpha * carmaSurfaceOpacity);
}
if (carmaScreenOpacity0 > 0.0 || carmaScreenOpacity1 > 0.0) {
  vec2 screenUv = vCarmaMapStyleClip.xy / vCarmaMapStyleClip.w * 0.5 + 0.5;
  float photographAlpha;
  float decorationAlpha;
  // carmaScreenImages returns straight RGB and coverage, including the framing.
  vec4 image = carmaReceiverImages(screenUv,vCarmaReceiverPosition,photographAlpha,decorationAlpha);
  carmaMarkings = vec4(image.rgb * image.a, image.a) + carmaMarkings * (1.0-image.a);
}
// Projective footprints and their labels already carry premultiplied RGB.
vec4 projectiveMarkings = carmaProjectiveMarkings();
carmaMarkings = projectiveMarkings + carmaMarkings * (1.0-projectiveMarkings.a);
if (carmaMarkings.a <= 0.0) discard;
// Three's normal transparent blending expects straight RGB and coverage alpha.
outgoingLight = carmaMarkings.rgb / max(carmaMarkings.a, 1e-5);
diffuseColor.a = carmaMarkings.a;
gl_FragColor = vec4(outgoingLight, diffuseColor.a);
#else
#ifdef CARMA_MAP_STYLE_OVERLAY
// Retain the mesh's light/shadow factor before replacing its color with a photograph.
const vec3 carmaLuma = vec3( 0.2126, 0.7152, 0.0722 );
float carmaAlbedo = max( dot( diffuseColor.rgb, carmaLuma ), 1e-3 );
float carmaLit = dot( outgoingLight, carmaLuma );
float carmaShade = clamp( carmaLit / carmaAlbedo, 0.35, 1.0 );
#endif
// World markings use visible mesh surfaces without the DEM street-label mask.
if ( carmaSurfaceOpacity > 0.0 ) {
  vec4 current = vec4(0.0);
  vec4 previous = vec4(0.0);
  if (all(greaterThanEqual(vCarmaSurfaceUv, vec2(0.0))) &&
      all(lessThanEqual(vCarmaSurfaceUv, vec2(1.0))))
    current = texture2D(carmaSurfaceTexture, vCarmaSurfaceUv);
  if (carmaSurfacePreviousEnabled > 0.5 &&
      all(greaterThanEqual(vCarmaSurfacePreviousUv, vec2(0.0))) &&
      all(lessThanEqual(vCarmaSurfacePreviousUv, vec2(1.0))))
    previous = texture2D(carmaSurfacePreviousTexture, vCarmaSurfacePreviousUv);
  // Interpolate premultiplied colors so unchanged markings keep their opacity.
  float alpha = mix(previous.a, current.a, carmaSurfaceTransition);
  vec3 color = mix(carmaMapStyleSRGBToLinear(previous.rgb) * previous.a,
                  carmaMapStyleSRGBToLinear(current.rgb) * current.a,
                  carmaSurfaceTransition);
  if (carmaSurfacePreviousOpacity >= 0.0) {
    // A finite trail fades beneath the current marking without dimming it.
    float trailAlpha = previous.a * carmaSurfacePreviousOpacity;
    alpha = current.a + trailAlpha * (1.0-current.a);
    color = carmaMapStyleSRGBToLinear(current.rgb) * current.a +
            carmaMapStyleSRGBToLinear(previous.rgb) * trailAlpha * (1.0-current.a);
  }
  outgoingLight = outgoingLight * (1.0-alpha*carmaSurfaceOpacity) + color*carmaSurfaceOpacity;
}
if (carmaScreenOpacity0 > 0.0 || carmaScreenOpacity1 > 0.0) {
  vec2 screenUv = vCarmaMapStyleClip.xy / vCarmaMapStyleClip.w * 0.5 + 0.5;
  float photographAlpha;
  float decorationAlpha;
  vec4 image = carmaReceiverImages(screenUv,vCarmaReceiverPosition,photographAlpha,decorationAlpha);
  // Filter only the visible receiver beneath/outside the photo. Its source RGB stays untouched.
  float outside = carmaScreenBackdropOpacity*(1.0-photographAlpha);
  if (outside>0.0) outgoingLight = mix(outgoingLight,carmaScreenBackdrop(outgoingLight),outside);
  // CSS white framing blends in display sRGB. Place it beneath the photograph
  // so fading/antialiasing cannot attenuate the photograph's foreground color.
  if (decorationAlpha>0.0) outgoingLight = carmaMapStyleSRGBToLinear(
    mix(carmaMapStyleLinearToSRGB(outgoingLight),vec3(1.0),decorationAlpha));
  vec3 photograph = max(image.rgb*image.a-vec3(decorationAlpha*(1.0-photographAlpha)),vec3(0.0));
  outgoingLight = outgoingLight*(1.0-photographAlpha)+photograph;
  // Image coverage suppresses only labels over the photograph, never those
  // around it. Existing depth matching still makes roofs/facades occlude them.
#ifdef CARMA_MAP_STYLE_OVERLAY
  if (carmaScreenBasemapLabels < 0.5)
    carmaMapStyleLabelCoverage *= 1.0-photographAlpha;
#endif
}
#ifdef CARMA_MAP_STYLE_OVERLAY
if ( carmaMapStyleLabelCoverage > 0.0 ) {
  outgoingLight = mix(outgoingLight,carmaMapStyleLabelColor * carmaShade,carmaMapStyleLabelCoverage);
}
#endif
// Keep the oriented footprint and identity above the photograph and its draped labels.
vec4 projectiveMarkings = carmaProjectiveMarkings();
outgoingLight = outgoingLight * (1.0-projectiveMarkings.a) + projectiveMarkings.rgb;
#include <opaque_fragment>
#endif
#endif
`;

export const MAP_STYLE_PROJECTION_FRAGMENT_BODY = /* glsl */ `
#ifndef CARMA_MAP_STYLE_MARKINGS_ONLY
#include <map_fragment>
#ifndef CARMA_MAP_STYLE_PHOTO_ONLY
if ( carmaMapStyleEnabled > 0.5 && vCarmaMapStyleClip.w > 0.0 ) {
  vec2 carmaMapStyleUv = vCarmaMapStyleClip.xy / vCarmaMapStyleClip.w * 0.5 + 0.5;
  if (
    all( greaterThanEqual( carmaMapStyleUv, vec2( 0.0 ) ) ) &&
    all( lessThanEqual( carmaMapStyleUv, vec2( 1.0 ) ) )
  ) {
    vec4 carmaMapStyleSample = carmaMapStyleSampleGround( carmaMapStyleUv );
#ifdef CARMA_MAP_STYLE_OVERLAY
    // MapLibre leaves premultiplied color in the framebuffer. Straighten it,
    // linearize and composite it over the receiver's own texture so a
    // label-only capture keeps the mesh texture visible in between.
    if ( carmaMapStyleSample.a > 0.0 && !carmaMapStyleOccludedByMesh( carmaMapStyleUv ) ) {
      vec3 carmaMapStyleStraight = carmaMapStyleSRGBToLinear(
        clamp( carmaMapStyleSample.rgb / carmaMapStyleSample.a, 0.0, 1.0 )
      );
      // Glyph and halo bodies land at full coverage; only the antialiased
      // rim keeps a partial blend, so the draped text reads solid. The color
      // is applied after lighting (see the opaque stage below): fed in as
      // albedo it would clip to white under direct sun.
      carmaMapStyleLabelCoverage = smoothstep( 0.15, 0.55, carmaMapStyleSample.a );
      carmaMapStyleLabelColor = carmaMapStyleStraight;
    }
#else
    if ( carmaMapStyleSample.a > 0.0 ) {
      diffuseColor.rgb = carmaMapStyleSRGBToLinear(
        clamp( carmaMapStyleSample.rgb / carmaMapStyleSample.a, 0.0, 1.0 )
      );
      diffuseColor.a = 1.0;
    }
#endif
  }
}
#endif
#endif
`;

/**
 * Add a stable screen projection of MapLibre's preceding ground pass to a
 * terrain material. The projected color enters before Lambert lighting, so
 * terrain and the style draped onto it receive the same Three.js shadows.
 */
