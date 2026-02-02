# Recreating the `civinfo` map (standalone instructions)

This file explains how to recreate the civinfo map used by `ShopExplorer` so another project
can implement the same map behavior (zooming, centering, markers, popups, clustering, etc.)
when they only receive this markdown.

The instructions below are self-contained: copy the HTML, CSS/JS includes, the sample
initialization code and the expected data format. Adjust tile provider and tokens to match
your environment.

---

## Quick summary

- Purpose: reproduce the civinfo map (Leaflet-based) used in `ShopExplorer`.
- What you get here: copy-paste-ready HTML, the JS initializer `initCivinfoMap`, sample helpers, and a sample JSON data schema.
- Important: include Leaflet (or your chosen map library), tile provider URL and any provider token.

---

## HTML + includes (copy into a simple page)

Include Leaflet CSS/JS (or the equivalent mapping library) and a container element for the map.

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      #civinfo-map { height: 480px; width: 100%; }
    </style>
  </head>
  <body>
    <div id="civinfo-map"></div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <!-- Optionally include markercluster or other plugins here -->
    <script type="module" src="./init-civinfo.js"></script>
  </body>
</html>
```

---

## JS initializer (copy to `init-civinfo.js`)

This file exposes `initCivinfoMap(containerEl, options)` which recreates the civinfo behavior.

```js
import L from 'leaflet';
// If you want clustering: import 'leaflet.markercluster';

/**
 * options:
 *  - center: [lat, lng] or null
 *  - zoom: integer
 *  - fitBounds: [[minLat,minLng],[maxLat,maxLng]] to auto-zoom to markers
 *  - tileUrl: tile provider template
 *  - token: provider token (substitute into tileUrl if needed)
 *  - items: array of shop objects (see sample data below)
 */
export function initCivinfoMap(containerEl, options = {}) {
  const center = options.center || [51.505, -0.09];
  const zoom = typeof options.zoom === 'number' ? options.zoom : 13;

  const map = L.map(containerEl, { preferCanvas: true }).setView(center, zoom);

  const tileUrl = options.tileUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileOpts = { attribution: options.attribution || '&copy; OpenStreetMap contributors' };
  if (options.token) tileOpts.token = options.token; // if your provider needs it

  L.tileLayer(tileUrl, tileOpts).addTo(map);

  // Create markers from items
  const items = options.items || [];
  const markers = items.map(item => {
    // expected item: { id, name, lat, lng, desc, extra }
    if (!item || typeof item.lat !== 'number' || typeof item.lng !== 'number') return null;
    const marker = L.marker([item.lat, item.lng]);
    marker.bindPopup(`<strong>${escapeHtml(item.name || '')}</strong><div>${escapeHtml(item.desc || '')}</div>`);
    return marker;
  }).filter(Boolean);

  // If using marker cluster plugin, add to cluster group; otherwise add directly
  let group;
  if (window.L && L.markerClusterGroup) {
    group = L.markerClusterGroup();
    markers.forEach(m => group.addLayer(m));
    map.addLayer(group);
  } else {
    group = L.featureGroup(markers).addTo(map);
  }

  // If fitBounds provided, respect it; otherwise fit to markers if any
  if (options.fitBounds && Array.isArray(options.fitBounds)) {
    map.fitBounds(options.fitBounds);
  } else if (markers.length) {
    map.fitBounds(group.getBounds(), { padding: [20, 20] });
  }

  // Expose some convenience behavior
  map.on('popupopen', () => { /* track open/popups if needed */ });

  return { map, markers, group };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

---

## Negative zooms & integer tile zoom rounding (matching ShopExplorer)

The civinfo map uses negative zoom levels (z0, z-1, z-2, z-5) and forces tile requests to use integer zoom levels. Copy this snippet into your initializer (it assumes Leaflet):

```js
// Create map with negative zoom range
const map = L.map('civinfo-map', {
  crs: L.CRS.Simple,
  minZoom: -5,
  maxZoom: 6,
  zoomSnap: 0.1,
  attributionControl: false,
  zoomControl: false,
  preferCanvas: true
});

// Rounded tile layer that forces integer zoom values
const RoundedTileLayer = L.TileLayer.extend({
  getTileUrl: function(coords) {
    const data = {
      r: L.Browser.retina ? '@2x' : '',
      s: this._getSubdomain(coords),
      x: coords.x,
      y: coords.y,
      z: Math.round(coords.z) // Force integer zoom
    };
    return L.Util.template(this._url, L.extend(data, this.options));
  }
});

const localTiles = options.tileUrl || 'https://your.tileserver/tiles/terrain/z{z}/{x},{y}.png';
const tiles = new RoundedTileLayer(localTiles, {
  minZoom: -5,
  maxZoom: 6,
  tileSize: 256,
  noWrap: true
}).addTo(map);

// Optional fallback to alternate server if tiles fail
const primaryTiles = 'https://civmc-map.duckdns.org/tiles/terrain/z{z}/{x},{y}.png';
tiles.on('tileerror', function() {
  if (this._url === localTiles) this.setUrl(primaryTiles);
});

// Keep a visual center while zooming (accounts for UI side-panels)
function getVisualCenter() {
  const isMobile = window.innerWidth <= 768;
  const currentCenter = map.getCenter();
  const currentZoom = map.getZoom();
  const point = map.project(currentCenter, currentZoom);
  let visualPoint;
  if (isMobile) visualPoint = point.subtract([0, window.innerHeight * 0.14]);
  else visualPoint = point.add([190, 0]);
  return map.unproject(visualPoint, currentZoom);
}

function flyToWithOffset(latlng, zoom, options = {}) {
  const isMobile = window.innerWidth <= 768;
  const point = map.project(latlng, zoom);
  const offsetPoint = isMobile ? point.add([0, window.innerHeight * 0.14]) : point.subtract([190, 0]);
  const offsetLatLng = map.unproject(offsetPoint, zoom);
  map.flyTo(offsetLatLng, zoom, { duration: 0.6, easeLinearity: 0.25, noMoveStart: true, ...options });
}

// Override map zoom methods to preserve visual center
map.zoomIn = function(delta = 1, options) {
  const visualCenter = getVisualCenter();
  const zoom = map.getZoom() + delta;
  flyToWithOffset(visualCenter, zoom, options);
  return this;
};

map.zoomOut = function(delta = 1, options) {
  const visualCenter = getVisualCenter();
  const zoom = map.getZoom() - delta;
  flyToWithOffset(visualCenter, zoom, options);
  return this;
};
```

Notes:
- `crs: L.CRS.Simple` is used by `ShopExplorer` because the map is a simple game-world projection. If you are using geographic tiles (OSM/Mapbox), remove or change the CRS accordingly.
- Negative zooms allow showing a large world as a single tile at z0, then progressively zoom in to z-1, z-2, etc. Ensure your tile server supports those zoom levels.

---

## Sample data schema (JSON): what `items` should look like

```json
[
  {
    "id": "shop-1",
    "name": "Baker's Delight",
    "lat": -33.8688,
    "lng": 151.2093,
    "desc": "Open 9–5",
    "extra": { "type": "bakery" }
  }
]
```

Notes on coordinates and ordering:
- Coordinates must be numbers and in `[lat, lng]` order. If you have `[lng, lat]`, swap them.

---

## Example usage (mounting)

In a page/script after the DOM loads:

```js
import { initCivinfoMap } from './init-civinfo.js';

const el = document.getElementById('civinfo-map');
const shopData = await fetch('/data/shops.json').then(r => r.json());

const { map } = initCivinfoMap(el, {
  center: [51.505, -0.09],
  zoom: 12,
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  items: shopData
});
```

## Recommended optional features to match ShopExplorer UX
- Marker clustering (Leaflet.markercluster) for many points.
- Custom marker icons for different `type` values.
- Popup content richer than plain text: HTML with links and image thumbnails.
- Controls: `L.control.zoom`, `L.control.layers` for toggling overlays.

## Checklist for the recipient (what to verify)
- Include Leaflet CSS/JS or equivalent mapping library.
- Confirm tile URL and provider token (Mapbox, etc.) if used.
- Ensure the map container has explicit height in CSS.
- Supply `items` with numeric `lat` and `lng` fields.
- If reusing icons, copy the asset files and ensure URL paths are correct.

## Troubleshooting
- Blank map: missing CSS height on container or tiles blocked by CORS/token.
- No markers: coordinates missing or swapped; check `typeof item.lat === 'number'`.
- Popups not showing: verify `bindPopup` is called and popup HTML is valid.

---

If you'd like, I can also create the actual `init-civinfo.js` file and a tiny HTML demo and add them to this repo so you can attach those files to the other project along with this markdown. Tell me which you prefer and I'll implement it.
# Recreating the `civinfo` map (standalone instructions)

This file explains how to recreate the civinfo map used by `ShopExplorer` so another project
can implement the same map behavior (zooming, centering, markers, popups, clustering, etc.)
when they only receive this markdown.

The instructions below are self-contained: copy the HTML, CSS/JS includes, the sample
initialization code and the expected data format. Adjust tile provider and tokens to match
your environment.
---

## Quick summary

- Purpose: reproduce the civinfo map (Leaflet-based) used in `ShopExplorer`.
- What you get here: copy-paste-ready HTML, the JS initializer `initCivinfoMap`, sample helpers, and a sample JSON data schema.
- Important: include Leaflet (or your chosen map library), tile provider URL and any provider token.

## HTML + includes (copy into a simple page)

Include Leaflet CSS/JS (or the equivalent mapping library) and a container element for the map.

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      #civinfo-map { height: 480px; width: 100%; }
    </style>
  </head>
  <body>
    <div id="civinfo-map"></div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <!-- Optionally include markercluster or other plugins here -->
    <script type="module" src="./init-civinfo.js"></script>
  </body>
</html>
```
---
import ShopExplorer from '../components/shops/ShopExplorer.astro';
// gather/prepare any data the component expects (items, config, token, etc.)
const shops = await fetch('/data/shops.json').then(r => r.json());
---

<ShopExplorer shops={shops} />
```

Notes:
- Ensure you also copy any CSS, image assets, and external scripts that `ShopExplorer.astro` depends on (Leaflet / map provider CSS & JS, custom icons, and any environment tokens).
- If you only want the map portion, check whether the component exposes a prop to toggle UI pieces (e.g. `showOnly="map"` or similar). If not, use approach B below.

---

## B — Extract the civinfo map markup + init script (Embed in non-Astro app or lightweight page)

This is the safer choice if you only need the map and not the full component UI or Astro props.

Steps:
1. Open `src/components/shops/ShopExplorer.astro` and copy the map container element (look for a `<div>` with an id/class like `civinfo-map`, `map`, or similar) and the adjacent script that initializes the map.
2. Copy any helper functions used to create markers / layers from the component or from `src/lib` (or wherever helpers live).
3. Copy required CSS rules and external library references (Leaflet CSS, map provider CSS). If the original uses a provider token (Mapbox, etc.), add that token to your target project's env/config.

Minimal extracted example (generic — adapt to the initialization code you find inside `ShopExplorer.astro`):

HTML
```html
<div id="civinfo-map" style="height:480px; width:100%;"></div>
```

JS (module file / inline script)
```js
import L from 'leaflet'; // or include Leaflet via <script> tag if not using modules
import { buildCivinfoMarkers } from './map-utils.js'; // copy helper logic

export function initCivinfoMap(containerEl, options = {}) {
  const map = L.map(containerEl).setView(options.center || [0,0], options.zoom || 6);
  L.tileLayer(options.tileUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Add markers/overlays using helper(s) copied from ShopExplorer
  const markers = buildCivinfoMarkers(options.items || []);
  markers.forEach(m => m.addTo(map));

  return map;
}
```

## JS initializer (copy to `init-civinfo.js`)

This file exposes `initCivinfoMap(containerEl, options)` which recreates the civinfo behavior.

```js
import L from 'leaflet';
// If you want clustering: import 'leaflet.markercluster';

/**
 * options:
 *  - center: [lat, lng] or null
 *  - zoom: integer
 *  - fitBounds: [[minLat,minLng],[maxLat,maxLng]] to auto-zoom to markers
 *  - tileUrl: tile provider template
 *  - token: provider token (substitute into tileUrl if needed)
 *  - items: array of shop objects (see sample data below)
 */
export function initCivinfoMap(containerEl, options = {}) {
  const center = options.center || [51.505, -0.09];
  const zoom = typeof options.zoom === 'number' ? options.zoom : 13;

  const map = L.map(containerEl, { preferCanvas: true }).setView(center, zoom);

  const tileUrl = options.tileUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileOpts = { attribution: options.attribution || '&copy; OpenStreetMap contributors' };
  if (options.token) tileOpts.token = options.token; // if your provider needs it

  L.tileLayer(tileUrl, tileOpts).addTo(map);

  // Create markers from items
  const items = options.items || [];
  const markers = items.map(item => {
    // expected item: { id, name, lat, lng, desc, extra }
    if (!item || typeof item.lat !== 'number' || typeof item.lng !== 'number') return null;
    const marker = L.marker([item.lat, item.lng]);
    marker.bindPopup(`<strong>${escapeHtml(item.name || '')}</strong><div>${escapeHtml(item.desc || '')}</div>`);
    return marker;
  }).filter(Boolean);

  // If using marker cluster plugin, add to cluster group; otherwise add directly
  let group;
  if (window.L && L.markerClusterGroup) {
    group = L.markerClusterGroup();
    markers.forEach(m => group.addLayer(m));
    map.addLayer(group);
  } else {
    group = L.featureGroup(markers).addTo(map);
  }

  // If fitBounds provided, respect it; otherwise fit to markers if any
  if (options.fitBounds && Array.isArray(options.fitBounds)) {
    map.fitBounds(options.fitBounds);
  } else if (markers.length) {
    map.fitBounds(group.getBounds(), { padding: [20, 20] });
  }

  // Expose some convenience behavior
  map.on('popupopen', () => { /* track open/popups if needed */ });

  return { map, markers, group };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

## Sample data schema (JSON): what `items` should look like

```json
[
  {
    "id": "shop-1",
    "name": "Baker's Delight",
    "lat": -33.8688,
    "lng": 151.2093,
    "desc": "Open 9–5",
    "extra": { "type": "bakery" }
  }
]
```

Notes on coordinates and ordering:
- Coordinates must be numbers and in `[lat, lng]` order. If you have `[lng, lat]`, swap them.

## Example usage (mounting)

In a page/script after the DOM loads:

```js
import { initCivinfoMap } from './init-civinfo.js';

const el = document.getElementById('civinfo-map');
const shopData = await fetch('/data/shops.json').then(r => r.json());

const { map } = initCivinfoMap(el, {
  center: [51.505, -0.09],
  zoom: 12,
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  items: shopData
});
```

## Recommended optional features to match ShopExplorer UX
- Marker clustering (Leaflet.markercluster) for many points.
- Custom marker icons for different `type` values.
- Popup content richer than plain text: HTML with links and image thumbnails.
- Controls: `L.control.zoom`, `L.control.layers` for toggling overlays.

## Checklist for the recipient (what to verify)
- Include Leaflet CSS/JS or equivalent mapping library.
- Confirm tile URL and provider token (Mapbox, etc.) if used.
- Ensure the map container has explicit height in CSS.
- Supply `items` with numeric `lat` and `lng` fields.
- If reusing icons, copy the asset files and ensure URL paths are correct.

## Troubleshooting
- Blank map: missing CSS height on container or tiles blocked by CORS/token.
- No markers: coordinates missing or swapped; check `typeof item.lat === 'number'`.
- Popups not showing: verify `bindPopup` is called and popup HTML is valid.

---

If you'd like, I can also create the actual `init-civinfo.js` file and a tiny HTML demo and add them to this repo so you can attach those files to the other project along with this markdown. Tell me which you prefer and I'll implement it.
