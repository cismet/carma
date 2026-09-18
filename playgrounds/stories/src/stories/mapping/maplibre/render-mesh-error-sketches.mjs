// Issue illustrations only. Conditional h=0 model, not surveyed mesh accuracy.
// See MESH_REFERENCE_DECISIONS.md / MESH-SCALE-ISOLINES-20260915.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const east=31.099569018571856,north=8.931681490105575,up=-7.325101430370864;
const horizontal=Math.hypot(east,north),spatial=Math.hypot(east,north,up);
assert(Math.abs(horizontal-32.35673233473382)<1e-8);
assert(Math.abs(spatial-33.17552167407214)<1e-8);
const versions={
  de:{title:'Beyenburg: Woher könnten 32 m Lageversatz kommen?',
    caveat:'Bedingtes Rechenmodell — kein bestätigter Fehler des Mesh 2024',
    assumptions:'Annahme: echtes WGS84-ECEF bei h = 0, starrer Mount, unkorrigierte MapLibre-Meterumrechnung.',
    a:'1 · Draufsicht: Ost und Nord bestimmen den Bildversatz',
    ref:'Referenz in Web Mercator',mesh:'Starr montiertes ECEF-Modell',east:'Ost: +31,10 m',north:'Nord: +8,93 m',
    position:'Gemeinsamer Mount = gleiche Position, nicht automatisch gleicher Maßstab.',
    origin:'Mount',distance:'Beyenburg liegt etwa 9,7 km östlich.',
    b:'2 · Seitenansicht: Höhe ist ein eigener Anteil',plane:'Lokale Referenzebene',height:'Höhe: −7,33 m',
    sight:'Orthografisch senkrechter Blick',
    orthographic:'Senkrechte Orthografie: ΔHöhe trägt 0 zum Bildversatz bei.',perspective:'Perspektive / Neigung: zusätzlicher, kameraabhängiger Bildversatz.',
    c:'3 · Fehlerbilanz — Komponenten nicht als Beträge addieren',
    hformula:'Lage: √(31,10² + 8,93²) = 32,36 m',
    formula:'Räumlich: √(31,10² + 8,93² + 7,33²) = 33,18 m',
    reason1:'Die rund 31 m Ostversatz brauchen eine zusätzliche Ursache:',
    reason2:'hier: 0,315 % angenommener Metrikunterschied über rund 9,7 km.',
    reason3:'Breitenkreis-Biegung erklärt vor allem Nord (~9 m); Breiten-Mercator-Drift hier nur ~1 cm.',
    warning:'Ohne diesen Metrikunterschied sind 32 m nicht begründet.',
    footer:'Nach linearer Ost-/Nordkorrektur: in diesem Modell noch etwa 9,12 m Lageversatz. Kein gemessener Restfehler.',
    source:'Eigene schematische Darstellung; Pfeile / Profile nicht maßstäblich. Keine Höhenbezugs- oder Datengenauigkeitsbestätigung.'},
  en:{title:'Beyenburg: What could cause a 32 m horizontal offset?',
    caveat:'Conditional calculation — not a confirmed error in the 2024 mesh',
    assumptions:'Assumption: true WGS84 ECEF at h = 0, rigid mount, uncorrected MapLibre metre conversion.',
    a:'1 · Top view: east and north determine the image offset',
    ref:'Web Mercator reference',mesh:'Rigidly mounted ECEF model',east:'East: +31.10 m',north:'North: +8.93 m',
    position:'A shared mount fixes position; it does not automatically match scale.',
    origin:'Mount',distance:'Beyenburg is about 9.7 km east.',
    b:'2 · Side view: height is a separate component',plane:'Local reference plane',height:'Height: −7.33 m',
    sight:'Vertical orthographic view',
    orthographic:'Vertical orthographic view: height contributes zero image displacement.',perspective:'Perspective / tilt: additional image displacement depends on the camera.',
    c:'3 · Error budget — do not add component magnitudes',
    hformula:'Horizontal: √(31.10² + 8.93²) = 32.36 m',
    formula:'Spatial: √(31.10² + 8.93² + 7.33²) = 33.18 m',
    reason1:'The roughly 31 m east offset needs an additional cause:',
    reason2:'here: an assumed 0.315% metric mismatch over about 9.7 km.',
    reason3:'Parallel bending mainly explains north (~9 m); latitude Mercator drift here is only ~1 cm.',
    warning:'Without that metric mismatch, 32 m is not justified.',
    footer:'After linear east/north correction: about 9.12 m horizontal residual in this model. Not a measured residual.',
    source:'Original schematic; arrows / profiles not to scale. No certification of height datum or dataset accuracy.'}
};
const out=resolve('output/playwright');mkdirSync(out,{recursive:true});
for(const [lang,t] of Object.entries(versions)){
  const text=(x,y,s,size=18,attrs='')=>`<text x="${x}" y="${y}" font-size="${size}" ${attrs}>${s}</text>`;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1520" height="1090"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="context-stroke"/></marker></defs><rect width="100%" height="100%" fill="#fff"/><g font-family="DejaVu Sans,sans-serif" fill="#183147">`;
  svg+=text(55,58,t.title,32,'font-weight="bold"');
  svg+=`<rect x="55" y="83" width="1410" height="47" rx="6" fill="#fff1cf"/>`;
  svg+=text(72,114,t.caveat,22,'font-weight="bold"');
  svg+=text(55,163,t.assumptions,18);
  svg+=text(55,217,t.a,23,'font-weight="bold"');
  svg+=`<rect x="55" y="239" width="700" height="318" rx="8" fill="#f3f7fa"/>`;
  svg+=`<path d="M175 475H590V317" fill="none" stroke="#5c788c" stroke-width="2" marker-end="url(#arrow)"/>
    <path d="M175 475L590 317" stroke="#d37600" stroke-width="3" marker-end="url(#arrow)"/>
    <circle cx="175" cy="475" r="7" fill="#007bbd"/><circle cx="590" cy="317" r="7" fill="#d37600"/>`;
  svg+=text(75,521,t.ref,17);svg+=text(352,280,t.mesh,17);
  svg+=text(320,511,t.east,19);svg+=text(605,395,t.north,17);
  svg+=text(274,364,'32.36 m',23,'fill="#a75900" font-weight="bold"');
  svg+=text(55,591,t.distance,17);svg+=text(55,620,t.position,17);
  svg+=text(795,217,t.b,22,'font-weight="bold"');
  svg+=`<rect x="785" y="239" width="680" height="318" rx="8" fill="#f3f7fa"/>
    <path d="M830 369H1425" stroke="#007bbd" stroke-width="2"/>
    <path d="M830 369 Q1120 369 1370 498" fill="none" stroke="#d37600" stroke-width="3"/>
    <path d="M1330 276V489" stroke="#536d80" stroke-width="2" marker-end="url(#arrow)"/>
    <path d="M1400 371V496" stroke="#d37600" stroke-width="2" marker-start="url(#arrow)" marker-end="url(#arrow)"/>`;
  svg+=text(830,347,t.plane,18);svg+=text(920,274,t.sight,17);
  svg+=text(1190,533,t.height,18);svg+=text(810,398,t.origin,16);
  svg+=text(795,590,t.orthographic,15);svg+=text(795,620,t.perspective,15);
  svg+=text(55,686,t.c,23,'font-weight="bold"');
  svg+=text(55,733,t.hformula,25,'font-weight="bold"');
  svg+=text(55,773,t.formula,22);
  svg+=text(55,829,t.reason1,20);svg+=text(55,858,t.reason2,20);
  svg+=text(55,891,t.reason3,18);
  svg+=text(55,945,t.warning,23,'font-weight="bold" fill="#a75900"');
  svg+=text(55,986,t.footer,17);svg+=text(55,1040,t.source,15);
  svg+='</g></svg>';
  writeFileSync(resolve(out,`mesh-topdown-error-explained-${lang}.svg`),svg);
}
console.log(JSON.stringify({horizontalMeters:horizontal,spatialMeters:spatial,outputs:['de','en']}));
