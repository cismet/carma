export const MAP_STYLE_PROJECTION_VERTEX_HEADER = /* glsl */ `
uniform mat4 carmaMapStyleSceneToClip;
varying vec4 vCarmaMapStyleClip;
`;

export const MAP_STYLE_PROJECTION_VERTEX_BODY = /* glsl */ `
#include <project_vertex>
vCarmaMapStyleClip = carmaMapStyleSceneToClip * modelMatrix * vec4( transformed, 1.0 );
`;

export const MAP_STYLE_PROJECTION_FRAGMENT_HEADER = /* glsl */ `
uniform sampler2D carmaMapStyleTexture;
uniform float carmaMapStyleEnabled;
uniform sampler2D carmaMapStyleDepthTexture;
uniform float carmaMapStyleDepthEnabled;
uniform vec2 carmaMapStyleDepthNearFar;
uniform vec2 carmaMapStyleTexelSize;
varying vec4 vCarmaMapStyleClip;
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
`;

export const MAP_STYLE_PROJECTION_FRAGMENT_OUTPUT = /* glsl */ `
#ifdef CARMA_MAP_STYLE_OVERLAY
if ( carmaMapStyleLabelCoverage > 0.0 ) {
  // Keep the surface's own light and shadow ratio (how much brighter or
  // darker lighting made the albedo) and apply it to the label color, so
  // the text stays the sun color in the light and darkens in shadow
  // without blowing out.
  const vec3 carmaLuma = vec3( 0.2126, 0.7152, 0.0722 );
  float carmaAlbedo = max( dot( diffuseColor.rgb, carmaLuma ), 1e-3 );
  float carmaLit = dot( outgoingLight, carmaLuma );
  float carmaShade = clamp( carmaLit / carmaAlbedo, 0.35, 1.0 );
  outgoingLight = mix(
    outgoingLight,
    carmaMapStyleLabelColor * carmaShade,
    carmaMapStyleLabelCoverage
  );
}
#endif
#include <opaque_fragment>
`;

export const MAP_STYLE_PROJECTION_FRAGMENT_BODY = /* glsl */ `
#include <map_fragment>
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
        carmaMapStyleSample.rgb
      );
      diffuseColor.a = 1.0;
    }
#endif
  }
}
`;

/**
 * Add a stable screen projection of MapLibre's preceding ground pass to a
 * terrain material. The projected color enters before Lambert lighting, so
 * terrain and the style draped onto it receive the same Three.js shadows.
 */
