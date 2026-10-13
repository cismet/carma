/** Full, uncropped sensor footprints. Shared by bake eligibility and final fragments. */
export const PHOTO_GAP_FOOTPRINT_INTERSECTION_GLSL = /* glsl */ `
uniform float carmaPhotoGapFootprints;
uniform mat4 carmaPhotoGapMetricToFootprint0;
uniform mat4 carmaPhotoGapMetricToFootprint1;
uniform mat4 carmaPhotoGapMetricToFootprint2;
uniform mat4 carmaPhotoGapMetricToFootprint3;
bool carmaGapInsideFootprint(vec3 point,mat4 projection){
 vec4 projected=projection*vec4(point,1.0);
 return projected.w>0.0&&projected.x>=0.0&&projected.y>=0.0&&projected.x<=projected.w&&projected.y<=projected.w;
}
bool carmaGapInsideFootprints(vec3 point){
 return carmaPhotoGapFootprints==4.0&&
  carmaGapInsideFootprint(point,carmaPhotoGapMetricToFootprint0)&&
  carmaGapInsideFootprint(point,carmaPhotoGapMetricToFootprint1)&&
  carmaGapInsideFootprint(point,carmaPhotoGapMetricToFootprint2)&&
  carmaGapInsideFootprint(point,carmaPhotoGapMetricToFootprint3);
}
`;

/** Stable, fixed-view repairs. Normal photo coverage remains authoritative. */
export const PHOTO_GAP_REPAIR_GLSL = /* glsl */ `
${PHOTO_GAP_FOOTPRINT_INTERSECTION_GLSL}
uniform sampler2D carmaPhotoGapTexture;
uniform sampler2D carmaPhotoGapGeometry;
uniform float carmaPhotoGapEnabled;
uniform float carmaPhotoGapPages;
uniform vec2 carmaPhotoGapFieldSize;
uniform mat4 carmaPhotoGapSceneToMetric;
uniform mat4 carmaPhotoGapMetricToClip0;
uniform mat4 carmaPhotoGapMetricToClip1;
uniform mat4 carmaPhotoGapMetricToClip2;
vec4 carmaGapPosition(float page,vec2 uv){
 if(any(lessThan(uv,vec2(0.0)))||any(greaterThanEqual(uv,vec2(1.0))))return vec4(0.0);
 return texture2D(carmaPhotoGapGeometry,vec2((page+uv.x)/carmaPhotoGapPages,uv.y*0.5));
}
vec4 carmaGapPage(vec3 point,mat4 metricToClip,float page,out float donorDistance){
 donorDistance=1e30;
 vec4 clip=metricToClip*vec4(point,1.0);
 if(clip.w<=0.0)return vec4(0.0);
 vec3 ndc=clip.xyz/clip.w;
 if(any(lessThan(ndc,vec3(-1.0)))||any(greaterThan(ndc,vec3(1.0))))return vec4(0.0);
 vec2 uv=(floor((ndc.xy*0.5+0.5)*carmaPhotoGapFieldSize)+0.5)/carmaPhotoGapFieldSize;
 if(any(greaterThanEqual(uv,vec2(1.0))))return vec4(0.0);
 vec4 repaired=texture2D(carmaPhotoGapTexture,vec2((page+uv.x)/carmaPhotoGapPages,uv.y));
 if(repaired.a<=0.01)return vec4(0.0);
 vec4 center=carmaGapPosition(page,uv);
 if(center.w<=0.0)return vec4(0.0);
 vec4 donor=texture2D(carmaPhotoGapGeometry,vec2((page+uv.x)/carmaPhotoGapPages,0.5+uv.y*0.5));
 if(donor.w<=0.0)return vec4(0.0);
 float candidateDistance=distance(point,donor.xyz);
 if(candidateDistance>20.0)return vec4(0.0);
 vec4 xp=carmaGapPosition(page,uv+vec2(1.0/carmaPhotoGapFieldSize.x,0.0));
 vec4 xn=carmaGapPosition(page,uv-vec2(1.0/carmaPhotoGapFieldSize.x,0.0));
 vec4 yp=carmaGapPosition(page,uv+vec2(0.0,1.0/carmaPhotoGapFieldSize.y));
 vec4 yn=carmaGapPosition(page,uv-vec2(0.0,1.0/carmaPhotoGapFieldSize.y));
 if((xp.w<=0.0&&xn.w<=0.0)||(yp.w<=0.0&&yn.w<=0.0))return vec4(0.0);
 vec3 dx=xp.w>0.0&&(xn.w<=0.0||distance(xp.xyz,center.xyz)<distance(xn.xyz,center.xyz))?xp.xyz-center.xyz:center.xyz-xn.xyz;
 vec3 dy=yp.w>0.0&&(yn.w<=0.0||distance(yp.xyz,center.xyz)<distance(yn.xyz,center.xyz))?yp.xyz-center.xyz:center.xyz-yn.xyz;
 vec3 normal=cross(dx,dy);float magnitude=length(normal);
 if(magnitude<0.0000001)return vec4(0.0);
 normal/=magnitude;
 // Reject a different facade/roof behind the baked receiver plane. Tangential
 // displacement within one raster cell is allowed; normal displacement is not.
 if(abs(dot(point-center.xyz,normal))>0.25)return vec4(0.0);
 donorDistance=candidateDistance;
 return vec4(repaired.rgb/repaired.a,1.0);
}
vec4 carmaPhotoGapSample(vec3 scenePosition){
 if(carmaPhotoGapEnabled<=0.0||carmaPhotoGapPages<1.0)return vec4(0.0);
 vec3 point=(carmaPhotoGapSceneToMetric*vec4(scenePosition,1.0)).xyz;
 if(!carmaGapInsideFootprints(point))return vec4(0.0);
 // Compare actual metric donor distances; fixed page order resolves equal ties.
 // The available candidates are sampled by the fixed raster, not a continuous search.
 float bestDistance;float candidateDistance;
 vec4 repaired=carmaGapPage(point,carmaPhotoGapMetricToClip0,0.0,bestDistance);
 if(carmaPhotoGapPages>1.0){
  vec4 candidate=carmaGapPage(point,carmaPhotoGapMetricToClip1,1.0,candidateDistance);
  if(candidate.a>0.0&&candidateDistance<bestDistance){repaired=candidate;bestDistance=candidateDistance;}
 }
 if(carmaPhotoGapPages>2.0){
  vec4 candidate=carmaGapPage(point,carmaPhotoGapMetricToClip2,2.0,candidateDistance);
  if(candidate.a>0.0&&candidateDistance<bestDistance)repaired=candidate;
 }
 return repaired;
}
`;
