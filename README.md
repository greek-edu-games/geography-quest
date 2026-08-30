# 🌍 Geography Quest

Learn country names by clicking them on a real world map, continent by continent.

**Play:** just open `index.html` in a browser — it's fully self-contained (no server, no internet needed).

## How it works
- **Grand Tour** plays all six continents easiest-first (Oceania → South America → North America → Europe → Africa → Asia), or pick any continent from the menu.
- Read the country name, click it on the map. First try = 100 pts + a speed bonus; a miss shows you which country you actually clicked and makes the target glow briefly among decoys. Three misses and the answer glows gold — click it to lock it into memory (0 pts).
- Streaks, per-continent stars (based on first-try accuracy) and best scores are saved in your browser.
- **Two languages**: English and Greek (pick on the title screen). In Greek, country names show with the English name as smaller secondary text.
- **Works with mouse and touch**: drag or swipe to pan; scroll-wheel, pinch, or the on-screen ＋/−/⛶ buttons to zoom. All sound effects are synthesized live with the Web Audio API (🔊 button to mute).

## PWA
The game is an installable Progressive Web App: `manifest.webmanifest` + `sw.js` precache everything, so once visited over HTTPS (or localhost) it works fully offline and can be added to the home screen on iOS/Android (standalone, dark theme, custom map icon). The service worker only registers when served over http(s) — opening `index.html` from disk still works as before. Bump the `CACHE` version in `sw.js` when deploying changes.

Icons are generated from the real map data: `PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core/index.mjs node make-icons.mjs` (needs Google Chrome).

## Rebuilding the map data
`index.html` is generated from `index.src.html` + `map-data.js`:

```sh
node build-map.mjs   # countries-110m.json (Natural Earth / world-atlas) -> map-data.js
node -e "const fs=require('fs');fs.writeFileSync('index.html',fs.readFileSync('index.src.html','utf8').replace('<script src=\"map-data.js\"></script>','<script>'+fs.readFileSync('map-data.js','utf8')+'</script>'))"
```

Map data: [world-atlas](https://github.com/topojson/world-atlas) 1:110m (public domain, derived from Natural Earth), drawn with the Natural Earth projection.
