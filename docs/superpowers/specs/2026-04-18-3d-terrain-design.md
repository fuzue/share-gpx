# 3D Terrain View with First-Person Playback — Design Spec

**Date:** 2026-04-18
**Status:** Approved

## Overview

Add a 3D terrain visualization to the GPX share page. Users can toggle between the existing 2D Leaflet map and a new 3D MapLibre view that renders real elevation terrain. In 3D mode, a first-person playback feature animates the camera along the trail, always pointing in the direction of travel.

## Stack additions

| Component | Choice | Reason |
|-----------|--------|--------|
| 3D map library | MapLibre GL JS | Open-source, WebGL, built-in terrain + FreeCameraOptions API |
| Base map tiles | OpenFreeMap Liberty | Free, no API key, global coverage |
| Terrain DEM tiles | AWS Terrain Tiles (Terrarium) | Free, no API key, ~30m global resolution |

No backend changes required.

## Architecture

Frontend-only change to `frontend/src/share.js` and `frontend/src/style.css`.

Two map containers exist simultaneously in the DOM; only one is visible at a time:
- `#map` — existing Leaflet 2D map (unchanged)
- `#map3d` — new MapLibre 3D map (lazy-initialized on first toggle)

```
share page
├── .share-wrapper
│   ├── #map          (Leaflet, shown in 2D mode)
│   ├── #map3d        (MapLibre, shown in 3D mode)
│   │   └── .playback-overlay  (play/pause, scrub, speed — visible in 3D only)
│   └── .chart-panel
│       ├── .chart-toggle-btn  (⌄/⌃ collapse button, always visible)
│       └── canvas#elevChart
```

The 2D/3D toggle button lives in the top-right corner of the map area (absolute positioned, z-index above both maps).

## Components

### `initMap3D(trail)`

Called once on first switch to 3D. Creates the MapLibre map with:
- OpenFreeMap Liberty style as base map
- AWS Terrain Tiles as `raster-dem` source (Terrarium encoding)
- `setTerrain({ source: 'terrain-dem', exaggeration: 1.5 })`
- GPX track as a GeoJSON line layer (same red color as 2D)
- Start/end markers

Guarded by an `initializing` flag to prevent double-init on rapid toggling.

### `updateCamera(idx)`

Positions the MapLibre `FreeCameraOptions` camera for first-person view:
- **Position**: `coords[idx]` at altitude `elevProfile[idx].ele_m + 30` meters above sea level
- **Target**: `coords[Math.min(idx + 3, coords.length - 1)]` (3-point look-ahead for smooth bearing transitions)
- `camera.lookAtPoint()` handles bearing and pitch automatically

Falls back to `ele_m = 0` if elevation data is missing for a point.

### `PlaybackController`

Manages playback state:
- **Speed multipliers** (points per animation frame at 60fps): 1× = 1, 2× = 2, 5× = 5, 10× = 10
- On each `requestAnimationFrame` tick: advance index by speed, call `updateCamera`, update scrub bar and position label
- Stops at end of track, holds camera at final position

### Playback overlay (HTML)

Floats at the bottom of `#map3d`:
```
[ ▶/⏸ ]  [========scrub bar========]  [2.4 km · 1820 m]  [speed ▾]
```
- Scrub bar: `<input type="range" min="0" max="N-1">`
- Dragging while playing: pauses, scrubs camera, resumes on `pointerup`
- Speed selector: `<select>` with 1×, 2×, 5×, 10× options

### Chart collapse toggle

A `⌄`/`⌃` button on the chart panel. Toggles a `.collapsed` CSS class on `.chart-panel` that sets `height: 0; overflow: hidden`. Works in both 2D and 3D modes.

## Data flow

```
trail.geojson.geometry.coordinates  →  coords[]  →  camera lat/lon
trail.elevation_profile[i].ele_m    →  elevProfile[]  →  camera altitude
trail.elevation_profile[i].dist_km  →  position label text
```

No new API endpoints or backend changes.

## Tile sources

```
Base map:    https://tiles.openfreemap.org/styles/liberty
Terrain DEM: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
             Encoding: (R×256 + G + B/256) − 32768 = meters
             tileSize: 256, maxzoom: 15
```

## Error handling

| Scenario | Behavior |
|----------|----------|
| Tile load failure | MapLibre degrades gracefully — flat terrain or missing base tiles, no crash |
| GPX missing elevation data | Camera altitude defaults to 30m, terrain still renders from DEM tiles |
| Track < 5 points | Look-ahead clamps: `Math.min(idx + 3, coords.length - 1)` |
| Single-point GPX | 3D toggle button disabled (same guard as existing `coords.length === 0` check) |
| Rapid 2D↔3D toggling | `initializing` flag prevents double MapLibre init |
| Mobile | MapLibre touch handling built-in; scrub and speed selector use native controls |

## Terrain exaggeration

Set to **1.5×** — makes elevation differences more visible for hiking/trail visualization without looking unrealistic.

## Out of scope

- Offline/self-hosted terrain tiles
- Recording or exporting the 3D flythrough
- Speed based on actual GPS timestamps (constant point-per-frame model used instead)
- 3D on the upload page
