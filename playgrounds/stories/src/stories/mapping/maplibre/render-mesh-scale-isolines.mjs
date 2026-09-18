// Reproducible issue illustration; analytical h=0 model, not measured mesh accuracy.
// Decision: MESH_REFERENCE_DECISIONS.md / MESH-SCALE-ISOLINES-20260915.
import { contours } from 'd3-contour';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const radians = degrees => degrees * Math.PI / 180;
const origin = [7.163461249942009, 51.24111123027258];
const bounds = [7.011041137873773, 51.16418982648751, 7.31648523301344, 51.31916900729646];
const phi0 = radians(origin[1]), lambda0 = radians(origin[0]);
const R = 6371008.8, a = 6378137, e2 = 6.6943799901413165e-3;
const mercator = phi => Math.log(Math.tan(Math.PI / 4 + phi / 2));
const ecef = (lambda, phi) => {
  const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  return [n * Math.cos(phi) * Math.cos(lambda), n * Math.cos(phi) * Math.sin(lambda), n * (1-e2) * Math.sin(phi)];
};
const root = ecef(lambda0, phi0);
const n0=a/Math.sqrt(1-e2*Math.sin(phi0)**2);
const m0=a*(1-e2)/(1-e2*Math.sin(phi0)**2)**1.5;
const boundaryPath=resolve('output/playwright/wuppertal-city-boundary.geojson');
const boundaryUrl='https://daten.wuppertal.de/Infrastruktur_Bauen_Wohnen/Stadtgebiet_EPSG4326_JSON.json';
mkdirSync(resolve(boundaryPath,'..'),{recursive:true});
if(!existsSync(boundaryPath)) {
  const response=await fetch(boundaryUrl);
  if(!response.ok) throw new Error(`Boundary HTTP ${response.status}`);
  const data=await response.json();
  assert.equal(data.type,'FeatureCollection');
  writeFileSync(boundaryPath,JSON.stringify(data));
}
const boundary=JSON.parse(readFileSync(boundaryPath,'utf8'));
const rings=boundary.features.flatMap(f=>f.geometry.type==='Polygon'?f.geometry.coordinates:f.geometry.coordinates.flat());
const project = (lon, lat) => {
  const phi = radians(lat), lambda = radians(lon);
  const p = ecef(lambda, phi).map((v, i) => v-root[i]);
  const east = -Math.sin(lambda0)*p[0] + Math.cos(lambda0)*p[1];
  const north = -Math.sin(phi0)*Math.cos(lambda0)*p[0] - Math.sin(phi0)*Math.sin(lambda0)*p[1] + Math.cos(phi0)*p[2];
  const x = R*Math.cos(phi0)*(lambda-lambda0);
  const y = R*Math.cos(phi0)*(mercator(phi)-mercator(phi0));
  const up=Math.cos(phi0)*Math.cos(lambda0)*p[0]+Math.cos(phi0)*Math.sin(lambda0)*p[1]+Math.sin(phi0)*p[2];
  return {east,north,up,x,y};
};
const error = (lon, lat) => {
  const {east,north,up,x,y}=project(lon,lat);
  const phi=radians(lat),lambda=radians(lon);
  const dl=lambda-lambda0;
  // First-order local axis fit: sphere ENU scaled N/R, M/R, 1, same geodetic coordinates.
  const sphereEast=n0*Math.cos(phi)*Math.sin(dl);
  const sphereNorth=m0*(Math.cos(phi0)*Math.sin(phi)-Math.sin(phi0)*Math.cos(phi)*Math.cos(dl));
  const sphereUp=R*(Math.sin(phi0)*Math.sin(phi)+Math.cos(phi0)*Math.cos(phi)*Math.cos(dl)-1);
  return [Math.abs(y-R*(phi-phi0)), Math.hypot(x-east,y-north),
    Math.hypot(x-east,y-north,up),Math.hypot(east-sphereEast,north-sphereNorth,up-sphereUp),up,
    Math.hypot(east-sphereEast,north-sphereNorth),up-sphereUp];
};
assert(error(...origin).every(v => Math.abs(v) < 1e-7));
assert(Math.abs(error(7.12825,51.20561)[0]-1.522283) < 1e-4);
assert(Math.abs(error(7.12825,51.20561)[1]-10.0921) < 0.01);

const nx=520, ny=420;
const fields=[[],[],[],[]];
for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) {
  const v=error(bounds[0]+i/(nx-1)*(bounds[2]-bounds[0]),bounds[3]-j/(ny-1)*(bounds[3]-bounds[1]));
  fields.forEach((f,k)=>f.push(v[k]));
}

// The same geodetic grid in both coordinate models; no residual amplification.
{
  const p=project(7.30194,51.23815);
  const metric=[p.east*(R/n0-1),p.north*(R/m0-1)];
  const frozen=[R*Math.cos(phi0)*radians(7.30194-origin[0]),R*radians(51.23815-origin[1])];
  const frame=[frozen[0]-p.east*R/n0,frozen[1]-p.north*R/m0];
  console.log(JSON.stringify({beyenburgDecomposition:{metric,frame,latitude:[p.x-frozen[0],p.y-frozen[1]],total:[p.x-p.east,p.y-p.north],RoverN:R/n0}}));
  let grid=`<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1750"><rect width="100%" height="100%" fill="white"/><g font-family="DejaVu Sans,sans-serif" fill="#172b40">`;
  grid+=text(65,55,'Dasselbe Breiten-/Längengitter in zwei Ebenen',32,'font-weight="bold"');
  grid+=text(65,92,'Blau: Mercator, Meter am Mount · Orange: WGS84 ECEF → ENU am Mount · h = 0 m',20);
  grid+=text(65,126,'Oben: gleiche Maßstäbe in Ost und Nord. Unten: Ost gestaucht, damit die Krümmung der Breitenkreise sichtbar wird.',17);
  const panels=[
    {x:365,y:205,w:1026.666666667,h:840,e0:-11000,e1:11000,n0:-9000,n1:9000,lats:Array.from({length:8},(_,i)=>51.18+i*.02),lons:Array.from({length:15},(_,i)=>7.02+i*.02)},
    {x:100,y:1160,w:1560,h:380,e0:-11000,e1:11000,n0:-20,n1:30,lats:[origin[1]-.0001,origin[1],origin[1]+.0001],lons:Array.from({length:15},(_,i)=>7.02+i*.02)},
  ];
  panels.forEach((a,k)=>{
    const X=e=>a.x+(e-a.e0)/(a.e1-a.e0)*a.w,Y=n=>a.y+(a.n1-n)/(a.n1-a.n0)*a.h;
    grid+=text(70,a.y-26,k?'B · Enger Streifen um die Mount-Breite; Ostmaßstab rund 107× kleiner als Nordmaßstab':'A · Gitter über Wuppertal; Differenzen im Originalmaßstab',20,'font-weight="bold"');
    grid+=`<defs><clipPath id="grid${k}"><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"/></clipPath></defs><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="#f8fafc"/><g clip-path="url(#grid${k})">`;
    for(const lat of a.lats) for(const mode of ['mercator','enu']){
      let d='';
      for(let i=0;i<=400;i++){
        const q=project(bounds[0]+i/400*(bounds[2]-bounds[0]),lat);
        d+=`${i?'L':'M'}${X(mode==='enu'?q.east:q.x).toFixed(3)},${Y(mode==='enu'?q.north:q.y).toFixed(3)}`;
      }
      grid+=`<path d="${d}" fill="none" stroke="${mode==='enu'?'#d66a00':'#007bbd'}" stroke-width="${k?2:1}"/>`;
    }
    for(const lon of a.lons) for(const mode of ['mercator','enu']){
      let d='';
      const low=k?origin[1]-.001:bounds[1],high=k?origin[1]+.001:bounds[3];
      for(let i=0;i<=150;i++){
        const q=project(lon,low+i/150*(high-low));
        d+=`${i?'L':'M'}${X(mode==='enu'?q.east:q.x).toFixed(3)},${Y(mode==='enu'?q.north:q.y).toFixed(3)}`;
      }
      grid+=`<path d="${d}" fill="none" stroke="${mode==='enu'?'#d66a00':'#007bbd'}" stroke-opacity=".7" stroke-width="${k?1:.8}"/>`;
    }
    if(!k){
      const d=rings.map(r=>r.map(([lon,lat],i)=>{const q=project(lon,lat);return `${i?'L':'M'}${X(q.x)},${Y(q.y)}`;}).join('')+'Z').join('');
      grid+=`<path d="${d}" fill="none" stroke="#52606b" stroke-width="1.2"/>`;
    }
    grid+='</g>';
    grid+=`<circle cx="${X(0)}" cy="${Y(0)}" r="5" fill="#172b40"/>`;
    grid+=text(X(0)+10,Y(0)-12,'Mount',15,'paint-order="stroke" stroke="white" stroke-width="3"');
    if(!k){
      for(const [e,n,color] of [[p.x,p.y,'#007bbd'],[p.east,p.north,'#d66a00']])grid+=`<circle cx="${X(e)}" cy="${Y(n)}" r="3" fill="${color}"/>`;
      grid+=text(X(p.x)-12,Y(p.y)-18,'Beyenburg',15,'text-anchor="end"');
    }
    for(const n of (k?[-20,-10,0,10,20,30]:[-8000,-4000,0,4000,8000]))grid+=text(a.x-10,Y(n)+5,`${n} m`,14,'text-anchor="end"');
    for(const e of [-10000,-5000,0,5000,10000])grid+=text(X(e),a.y+a.h+24,`${e/1000} km`,14,'text-anchor="middle"');
    grid+=`<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="none" stroke="#718096"/>`;
  });
  grid+=text(65,1606,'Auch bei exakt gleicher Breite: ENU-Nord = N cos φ₀ sin φ₀ · (1 − cos Δλ), Mercator-Nord = 0.',18);
  grid+=text(65,1640,'Der Ostfehler kommt überwiegend vom Verhältnis R/N ≈ 0,996847; die Breitenkreis-Biegung erklärt den Nordanteil.',18);
  grid+=text(65,1680,'Kein Höhenprofil: Beide Achsen zeigen horizontale Koordinaten. Stadtgrenze © Stadt Wuppertal, CC BY 4.0.',16);
  grid+='</g></svg>';
  writeFileSync(resolve('output/playwright/mesh-latlon-grid-comparison-de.svg'),grid);
}
const W=1560,H=1080, left=85, top=195, width=650,height=525;
function text(x,y,s,size=16,extra='') { return `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${s}</text>`; }
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/><g font-family="DejaVu Sans,sans-serif" fill="#172b40">`;
svg+=text(65,55,'Wuppertal · Projektionsfehler relativ zum Mesh-Mount',30,'font-weight="bold"');
svg+=text(65,90,'Isolinien alle 10 cm · starke Linien alle 1 m · analytisches Modell auf WGS84, Höhe 0 m',18);
svg+=text(65,120,'Schwarze Linie: Stadtgrenze Wuppertal · Nord oben · Achsen in geografischen Grad.',16);
const names=['A · Nur breitenabhängiger Mercator-Drift','B · Gesamter horizontaler Montagefehler'];
const places=[['Mount',...origin],['Cronenberg',7.12825,51.20561],['Elberfeld',7.1496,51.2562],['Barmen',7.1996,51.2726],['Dönberg',7.1627,51.29902],['Paul-Flocke-Weg',7.2496096,51.314393],['Beyenburg',7.30194,51.23815]];
fields.slice(0,2).forEach((field,k)=>{
  const x0=left+k*750;
  const X=lon=>x0+(lon-bounds[0])/(bounds[2]-bounds[0])*width;
  const Y=lat=>top+(bounds[3]-lat)/(bounds[3]-bounds[1])*height;
  svg+=text(x0,165,names[k],20,'font-weight="bold"');
  svg+=`<defs><clipPath id="clip${k}"><rect x="${x0}" y="${top}" width="${width}" height="${height}"/></clipPath></defs><rect x="${x0}" y="${top}" width="${width}" height="${height}" fill="#f5f8fc"/>`;
  const max=field.reduce((maximum,value)=>Math.max(maximum,value),0);
  const thresholds=Array.from({length:Math.floor(max*10)},(_,i)=>(i+1)/10);
  const lines=contours().size([nx,ny]).thresholds(thresholds)(field);
  svg+=`<g clip-path="url(#clip${k})" fill="none">`;
  for(const line of lines){
    const major=Math.abs(line.value-Math.round(line.value))<1e-6;
    const path=line.coordinates.flatMap(poly=>poly.map(ring=>ring.map((p,i)=>`${i?'L':'M'}${(x0+(p[0]-.5)/(nx-1)*width).toFixed(2)},${(top+(p[1]-.5)/(ny-1)*height).toFixed(2)}`).join('')+'Z')).join('');
    svg+=`<path d="${path}" stroke="${k?'#8341a1':'#147d9b'}" stroke-opacity="${major?.85:.25}" stroke-width="${major?1.1:.45}"/>`;
  }
  svg+='</g>';
  const boundaryD=rings.map(ring=>ring.map(([lon,lat],i)=>`${i?'L':'M'}${X(lon).toFixed(2)},${Y(lat).toFixed(2)}`).join('')+'Z').join('');
  svg+=`<path d="${boundaryD}" fill="none" stroke="#172b40" stroke-width="1.5" clip-path="url(#clip${k})"/>`;
  for(const lat of [51.18,51.22,51.26,51.30]) svg+=text(x0-8,Y(lat)+4,lat.toFixed(2)+'°',12,'text-anchor="end"');
  for(const lon of [7.05,7.10,7.15,7.20,7.25,7.30]) svg+=text(X(lon),top+height+23,lon.toFixed(2)+'°',12,'text-anchor="middle"');
  for(const [name,lon,lat] of places){
    const x=X(lon),y=Y(lat),value=error(lon,lat)[k];
    const anchor=lon>7.27?'end':'start',dx=lon>7.27?-9:9;
    svg+=`<circle cx="${x}" cy="${y}" r="${name==='Mount'?5:3}" fill="#16283a" stroke="white" stroke-width="1.5"/>`;
    svg+=text(x+dx,y-7,`${name} · ${value.toFixed(2).replace('.',',')} m`,12,`text-anchor="${anchor}" paint-order="stroke" stroke="white" stroke-width="3" stroke-linejoin="round"`);
  }
  svg+=`<rect x="${x0}" y="${top}" width="${width}" height="${height}" fill="none" stroke="#5c7185"/>`;
});
svg+=text(85,787,'A: Betrag der Nordabweichung gegenüber am Ursprung',17);
svg+=text(85,813,'eingefrorenem Kugelmaßstab. Ostabweichung = 0.',17);
svg+=text(85,849,'ΔN = R cos φ₀ · ln[tan(π/4+φ/2) / tan(π/4+φ₀/2)]',15);
svg+=text(85,874,'         − R (φ − φ₀)',15);
svg+=text(835,787,'B: Exakte Mercator-Position minus starres ECEF→ENU.',17);
svg+=text(835,813,'Enthält auch Ellipsoid/Kugel-Metrik und Rahmenfehler.',17);
svg+=text(835,849,'B ist nicht allein Mercator-Maßstabsdrift.',17,'font-weight="bold"');
svg+=text(835,874,'Keine gemessene Lagegenauigkeit des Mesh.',17);
svg+=text(65,937,'Bezugsmaß: Meter am Mount-Ursprung, nicht Bildschirm-Pixel. R = 6 371 008,8 m (MapLibre).',16);
svg+=text(65,967,'Mount: 7,16346125° E / 51,24111123° N. Ortsmarken dienen der Orientierung, nicht als Kontrollpunkte.',16);
svg+=text(65,997,'Die 10-cm-Linien sind Modellwerte, keine Datengenauigkeit. Stadtgrenze: © Stadt Wuppertal, CC BY 4.0.',15);
svg+='</g></svg>';
const output=resolve(process.argv[2]??'output/playwright/mesh-mercator-isolines-de.svg');
mkdirSync(resolve(output,'..'),{recursive:true});writeFileSync(output,svg);
console.log(JSON.stringify({output,contourIntervalMeters:.1,origin,bounds,cronenberg:error(7.12825,51.20561)}));

// Separate filled maps: total 3D model displacement and the locally axis-fitted sphere residual.
for(const index of [2,3]) {
  const residual=index===3;
  const field=fields[index], max=field.reduce((a,b)=>Math.max(a,b),0);
  const interval=residual?.01:.1;
  const thresholds=Array.from({length:Math.ceil(max/interval)},(_,i)=>(i+1)*interval);
  const x0=110,y0=165,w=1020,h=690;
  const X=lon=>x0+(lon-bounds[0])/(bounds[2]-bounds[0])*w;
  const Y=lat=>y0+(bounds[3]-lat)/(bounds[3]-bounds[1])*h;
  const color=value=>{
    const stops=[[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];
    const t=Math.min(3.999,Math.max(0,value/max*4)),i=Math.floor(t);
    return '#'+stops[i].map((v,k)=>Math.round(v+(stops[i+1][k]-v)*(t-i)).toString(16).padStart(2,'0')).join('');
  };
  let plot=`<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="1130"><rect width="100%" height="100%" fill="white"/><g font-family="DejaVu Sans,sans-serif" fill="#172b40">`;
  plot+=text(65,55,residual?'Lokal angepasste Kugel gegenüber WGS84':'Gesamter 3D-Abstand · starre Montage gegenüber Mercator',27,'font-weight="bold"');
  plot+=text(65,90,residual?'Nach Ursprungsausrichtung und Achsenskalierung N/R, M/R, 1':'√(ΔOst² + ΔNord² + ΔHöhe²) · kein reiner Höhenfehler',19);
  plot+=text(65,125,`Gefüllte ${residual?'1':'10'}-cm-Stufen · h = 0 m · gleiche geografische Koordinaten · schwarzer Umriss: Stadtgrenze`,16);
  plot+=`<defs><clipPath id="map"><rect x="${x0}" y="${y0}" width="${w}" height="${h}"/></clipPath></defs><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${color(0)}"/><g clip-path="url(#map)">`;
  for(const c of contours().size([nx,ny]).thresholds(thresholds)(field)){
    const d=c.coordinates.flatMap(poly=>poly.map(ring=>ring.map((p,i)=>`${i?'L':'M'}${(x0+(p[0]-.5)/(nx-1)*w).toFixed(2)},${(y0+(p[1]-.5)/(ny-1)*h).toFixed(2)}`).join('')+'Z')).join('');
    plot+=`<path d="${d}" fill="${color(c.value)}" fill-rule="evenodd"/>`;
  }
  const d=rings.map(ring=>ring.map(([lon,lat],i)=>`${i?'L':'M'}${X(lon).toFixed(2)},${Y(lat).toFixed(2)}`).join('')+'Z').join('');
  plot+=`<path d="${d}" fill="none" stroke="white" stroke-width="4"/><path d="${d}" fill="none" stroke="#172b40" stroke-width="1.7"/></g>`;
  for(const [name,lon,lat] of places){
    plot+=`<circle cx="${X(lon)}" cy="${Y(lat)}" r="4" fill="white"/>`;
    plot+=text(X(lon)+(lon>7.27?-10:10),Y(lat)-9,`${name}: ${error(lon,lat)[index].toFixed(2).replace('.',',')} m`,14,`text-anchor="${lon>7.27?'end':'start'}" fill="white" paint-order="stroke" stroke="#172b40" stroke-width="3" stroke-linejoin="round"`);
  }
  for(let i=0;i<100;i++)plot+=`<rect x="1170" y="${y0+(99-i)*h/100}" width="22" height="${h/100+1}" fill="${color(i/99*max)}"/>`;
  for(let i=0;i<=5;i++) plot+=text(1200,y0+h-i*h/5+5,(max*i/5).toFixed(2)+' m',13);
  for(const lon of [7.05,7.10,7.15,7.20,7.25,7.30]) plot+=text(X(lon),889,lon.toFixed(2).replace('.',',')+'° E',14,'text-anchor="middle"');
  for(const lat of [51.18,51.22,51.26,51.30]) plot+=text(x0-10,Y(lat)+5,lat.toFixed(2).replace('.',',')+'°',13,'text-anchor="end"');
  plot+=text(65,941,residual?'Kugelradius R = 6 371 008,8 m; N und M: WGS84-Krümmungsradien am Mount.':'Der Höhenanteil ist die Absenkung des Ellipsoids unter die lokale Tangentialebene.',17);
  plot+=text(65,974,residual?'Nur lineare lokale Anpassung, keine nichtlineare Reprojektion; kein optimierter Best-Fit.':'Die bisher gezeigten 32,36 m bei Beyenburg waren ausschließlich horizontal.',17);
  plot+=text(65,1007,'Modell, keine gemessene Mesh-Genauigkeit. Mount: 7,16346125° E / 51,24111123° N.',16);
  plot+=text(65,1040,'Stadtgrenze: © Stadt Wuppertal, CC BY 4.0; kleinräumige Gliederung, nicht flurstücksscharf.',15);
  plot+='</g></svg>';
  writeFileSync(resolve(`output/playwright/mesh-${residual?'sphere-corrected-residual':'total-3d-error'}-de.svg`),plot);
  console.log(JSON.stringify({field:residual?'sphereCorrectedResidual':'total3D',maxMeters:max,beyenburg:error(7.30194,51.23815)}));
}
