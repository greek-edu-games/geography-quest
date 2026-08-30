// One-time build step: countries-110m.json (TopoJSON) -> map-data.js
// Decodes TopoJSON arcs, projects with the Natural Earth projection,
// and emits per-country SVG paths + continent camera boxes + graticule.
import { readFileSync, writeFileSync } from 'node:fs';

const topo = JSON.parse(readFileSync(new URL('./countries-110m.json', import.meta.url)));

// ---------- TopoJSON decoding ----------
const [sx, sy] = topo.transform.scale;
const [tx, ty] = topo.transform.translate;
const arcs = topo.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
});
function ringPoints(arcIdxs) {
  const pts = [];
  for (const i of arcIdxs) {
    let a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
    if (pts.length) a = a.slice(1);
    pts.push(...a);
  }
  // Rings that cross the antimeridian (Fiji, Russia) would fill as a stripe
  // across the whole map. Unwrap them into 0..360 space; the projection
  // extends smoothly past x=1000 and the sliver beyond the edge is clipped.
  const crosses = pts.some((p, i) => i && Math.abs(p[0] - pts[i - 1][0]) > 180);
  return crosses ? pts.map(([lo, la]) => [lo < 0 ? lo + 360 : lo, la]) : pts;
}
function polygons(geom) { // -> array of polygons, each an array of rings (lon/lat)
  if (geom.type === 'Polygon') return [geom.arcs.map(ringPoints)];
  if (geom.type === 'MultiPolygon') return geom.arcs.map(p => p.map(ringPoints));
  return [];
}

// ---------- Natural Earth projection ----------
const D2R = Math.PI / 180;
function project([lon, lat]) {
  const l = lon * D2R, p = lat * D2R, p2 = p * p, p4 = p2 * p2;
  const x = l * (0.8707 - 0.131979 * p2 - 0.013791 * p4 + p4 * p4 * (0.003971 * p2 - 0.001529 * p4));
  const y = p * (1.007226 + 0.015085 * p2 + p4 * p2 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4));
  return [x, -y]; // flip y for SVG
}

// Global bounds -> normalize to width 1000
const XMAX = Math.PI * 0.8707;
const YMAX = -project([0, 90])[1];
const S = 1000 / (2 * XMAX);
const H = Math.round(2 * YMAX * S);
const toSvg = ll => { const [x, y] = project(ll); return [(x + XMAX) * S, (y + YMAX) * S]; };
const r1 = n => Math.round(n * 10) / 10;

// ---------- Continent assignment ----------
const C = {};
const assign = (cont, names) => names.forEach(n => C[n] = cont);
assign('Africa', ["Algeria","Angola","Benin","Botswana","Burkina Faso","Burundi","Cameroon","Central African Rep.","Chad","Congo","Côte d'Ivoire","Dem. Rep. Congo","Djibouti","Egypt","Eq. Guinea","Eritrea","Ethiopia","Gabon","Gambia","Ghana","Guinea","Guinea-Bissau","Kenya","Lesotho","Liberia","Libya","Madagascar","Malawi","Mali","Mauritania","Morocco","Mozambique","Namibia","Niger","Nigeria","Rwanda","S. Sudan","Senegal","Sierra Leone","Somalia","Somaliland","South Africa","Sudan","Tanzania","Togo","Tunisia","Uganda","W. Sahara","Zambia","Zimbabwe","eSwatini"]);
assign('Europe', ["Albania","Austria","Belarus","Belgium","Bosnia and Herz.","Bulgaria","Croatia","Cyprus","Czechia","Denmark","Estonia","Finland","France","Germany","Greece","Hungary","Iceland","Ireland","Italy","Kosovo","Latvia","Lithuania","Luxembourg","Macedonia","Moldova","Montenegro","N. Cyprus","Netherlands","Norway","Poland","Portugal","Romania","Russia","Serbia","Slovakia","Slovenia","Spain","Sweden","Switzerland","Ukraine","United Kingdom"]);
assign('Asia', ["Afghanistan","Armenia","Azerbaijan","Bangladesh","Bhutan","Brunei","Cambodia","China","Georgia","India","Indonesia","Iran","Iraq","Israel","Japan","Jordan","Kazakhstan","Kuwait","Kyrgyzstan","Laos","Lebanon","Malaysia","Mongolia","Myanmar","Nepal","North Korea","Oman","Pakistan","Palestine","Philippines","Qatar","Saudi Arabia","South Korea","Sri Lanka","Syria","Taiwan","Tajikistan","Thailand","Timor-Leste","Turkey","Turkmenistan","United Arab Emirates","Uzbekistan","Vietnam","Yemen"]);
assign('North America', ["Bahamas","Belize","Canada","Costa Rica","Cuba","Dominican Rep.","El Salvador","Greenland","Guatemala","Haiti","Honduras","Jamaica","Mexico","Nicaragua","Panama","Puerto Rico","Trinidad and Tobago","United States of America"]);
assign('South America', ["Argentina","Bolivia","Brazil","Chile","Colombia","Ecuador","Falkland Is.","Guyana","Paraguay","Peru","Suriname","Uruguay","Venezuela"]);
assign('Oceania', ["Australia","Fiji","New Caledonia","New Zealand","Papua New Guinea","Solomon Is.","Vanuatu"]);
// Rendered as scenery only, never asked:
const SKIP = new Set(["Antarctica","Fr. S. Antarctic Lands","N. Cyprus","Somaliland","W. Sahara","Falkland Is.","New Caledonia","Puerto Rico"]);

const RENAME = {
  "Bosnia and Herz.": "Bosnia & Herzegovina",
  "Central African Rep.": "Central African Republic",
  "Dem. Rep. Congo": "DR Congo",
  "Congo": "Republic of the Congo",
  "Dominican Rep.": "Dominican Republic",
  "Eq. Guinea": "Equatorial Guinea",
  "S. Sudan": "South Sudan",
  "Solomon Is.": "Solomon Islands",
  "United States of America": "United States",
  "Macedonia": "North Macedonia",
  "eSwatini": "Eswatini",
  "W. Sahara": "Western Sahara",
  "Falkland Is.": "Falkland Islands",
};

// ---------- Build countries ----------
const countries = [];
const missing = [];
for (const g of topo.objects.countries.geometries) {
  const name = g.properties.name;
  const cont = C[name] || (name === 'Antarctica' || name === 'Fr. S. Antarctic Lands' ? 'Antarctica' : null);
  if (!cont) missing.push(name);

  const polys = polygons(g);
  let d = '';
  let best = null; // largest ring for centroid
  for (const rings of polys) {
    for (let ri = 0; ri < rings.length; ri++) {
      const pts = rings[ri].map(toSvg);
      d += 'M' + pts.map(p => r1(p[0]) + ' ' + r1(p[1])).join('L') + 'Z';
      if (ri === 0) { // exterior ring: signed area + centroid
        let a = 0, cx = 0, cy = 0;
        for (let i = 0, n = pts.length; i < n; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
          const cr = x0 * y1 - x1 * y0;
          a += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
        }
        a /= 2;
        if (Math.abs(a) > 1e-9 && (!best || Math.abs(a) > best.a)) {
          best = { a: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
        }
      }
    }
  }
  countries.push({
    // NOTE: not g.id — world-atlas leaves id undefined for Kosovo/N. Cyprus/
    // Somaliland, which would collide; assign our own stable unique ids.
    id: countries.length,
    name: RENAME[name] || name,
    c: cont,
    d,
    cx: r1(best.cx),
    cy: r1(best.cy),
    q: !SKIP.has(name) && cont !== 'Antarctica' ? 1 : 0,
  });
}
if (missing.length) { console.error('UNMAPPED:', missing); process.exit(1); }

// ---------- Continent camera boxes (sample lon/lat window boundary) ----------
const WINDOWS = {
  'Europe':        [-26, 62, 34, 72],
  'Asia':          [24, 180, -12, 79],
  'Africa':        [-20, 55, -37, 38],
  'North America': [-170, -12, 6, 84],
  'South America': [-84, -34, -56, 13],
  'Oceania':       [112, 180, -48, 1],
};
const continents = {};
for (const [cont, [lo0, lo1, la0, la1]] of Object.entries(WINDOWS)) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    for (const ll of [
      [lo0 + t * (lo1 - lo0), la0], [lo0 + t * (lo1 - lo0), la1],
      [lo0, la0 + t * (la1 - la0)], [lo1, la0 + t * (la1 - la0)],
    ]) {
      const [x, y] = toSvg(ll);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  continents[cont] = [r1(x0), r1(y0), r1(x1 - x0), r1(y1 - y0)];
}

// ---------- Graticule (15° grid) ----------
let grat = '';
for (let lon = -180; lon <= 180; lon += 15) {
  grat += 'M' + Array.from({ length: 65 }, (_, i) => {
    const [x, y] = toSvg([lon, -90 + i * (180 / 64)]);
    return r1(x) + ' ' + r1(y);
  }).join('L');
}
for (let lat = -75; lat <= 75; lat += 15) {
  grat += 'M' + Array.from({ length: 129 }, (_, i) => {
    const [x, y] = toSvg([-180 + i * (360 / 128), lat]);
    return r1(x) + ' ' + r1(y);
  }).join('L');
}

const out = 'window.MAP=' + JSON.stringify({ W: 1000, H, countries, continents, graticule: grat }) + ';';
writeFileSync(new URL('./map-data.js', import.meta.url), out);

const byCont = {};
for (const c of countries) byCont[c.c] = (byCont[c.c] || 0) + (c.q ? 1 : 0);
console.log('OK. H=' + H + ', size=' + (out.length / 1024).toFixed(0) + 'KB, quizable per continent:', byCont);
