import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } from 'chart.js'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

// Fix default icon resolution with bundlers by using explicit asset imports
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

export async function renderShare(app, uuid) {
  app.innerHTML = `
    <div class="share-wrapper">
      <div class="map-container">
        <div id="map" class="map">
          <div class="stats-overlay" id="statsOverlay"></div>
          <div id="mapLoading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:1000;pointer-events:none;color:#aaa;font-size:14px;">Loading trail…</div>
        </div>
        <div id="map3d" class="map hidden"></div>
        <button id="toggleView" class="toggle-view-btn">3D</button>
        <div id="playbackOverlay" class="playback-overlay hidden">
          <button id="playPauseBtn" class="play-pause-btn">▶</button>
          <input id="scrubBar" type="range" min="0" value="0" class="scrub-bar">
          <span id="positionLabel" class="position-label"></span>
          <select id="speedSelect" class="speed-select">
            <option value="1">1×</option>
            <option value="2" selected>2×</option>
            <option value="5">5×</option>
            <option value="10">10×</option>
          </select>
        </div>
      </div>
      <div class="chart-panel" id="chartPanel">
        <button id="chartToggleBtn" class="chart-toggle-btn" title="Toggle elevation chart">⌄</button>
        <canvas id="elevChart"></canvas>
      </div>
    </div>
  `

  let trail
  try {
    const res = await fetch(`/api/trail/${uuid}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    trail = await res.json()
  } catch (err) {
    app.innerHTML = `<div class="error-page">Trail not found.</div>`
    return
  }

  document.getElementById('mapLoading')?.remove()
  document.title = trail.filename || 'GPX Trail'

  const map = L.map('map')
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map)

  const coords = trail.geojson?.geometry?.coordinates?.map(([lon, lat]) => [lat, lon]) ?? []
  const geoCoords = trail.geojson?.geometry?.coordinates ?? []

  if (coords.length === 0) {
    app.innerHTML = `<div class="error-page">Trail has no trackpoints.</div>`
    return
  }

  const polyline = L.polyline(coords, { color: '#e74c3c', weight: 3 }).addTo(map)
  map.fitBounds(polyline.getBounds(), { padding: [40, 40] })

  const greenIcon = L.divIcon({ className: '', html: '<div style="width:12px;height:12px;border-radius:50%;background:#27ae60;border:2px solid #fff;"></div>' })
  const redIcon = L.divIcon({ className: '', html: '<div style="width:12px;height:12px;border-radius:50%;background:#e74c3c;border:2px solid #fff;"></div>' })
  L.marker(coords[0], { icon: greenIcon }).bindTooltip('Start').addTo(map)
  L.marker(coords[coords.length - 1], { icon: redIcon }).bindTooltip('End').addTo(map)

  const stats = document.getElementById('statsOverlay')
  stats.textContent = ''
  const statParts = [
    `📏 ${trail.distance_km} km`,
    `⛰️ ${trail.elevation_gain_m} m ↑`,
  ]
  if (trail.duration_min != null) {
    const h = Math.floor(trail.duration_min / 60)
    const m = Math.round(trail.duration_min % 60)
    statParts.push(`⏱️ ${h > 0 ? h + 'h ' : ''}${m}m`)
  }
  statParts.forEach(text => {
    const span = document.createElement('span')
    span.textContent = text
    stats.appendChild(span)
  })

  // Cursor dot shown on map during hover/touch sync
  const cursorMarker = L.circleMarker([0, 0], {
    radius: 6,
    color: '#fff',
    fillColor: '#f39c12',
    fillOpacity: 1,
    weight: 2,
    interactive: false,
  }).addTo(map)
  cursorMarker.setStyle({ opacity: 0, fillOpacity: 0 })

  // "X.XX km from start · NNN m" label shown inside the map during sync
  const cursorInfo = document.createElement('div')
  cursorInfo.style.cssText = 'position:absolute;bottom:12px;left:12px;z-index:1001;background:rgba(0,0,0,0.75);color:#fff;padding:4px 10px;border-radius:4px;font-size:13px;display:none;pointer-events:none'
  document.getElementById('map').appendChild(cursorInfo)

  const elevProfile = trail.elevation_profile ?? []
  let chart = null

  function moveCursor(idx, centerMap = false) {
    const c = coords[idx]
    const ep = elevProfile[idx]
    if (!c) return
    cursorMarker.setLatLng(c).setStyle({ opacity: 1, fillOpacity: 1 })
    if (centerMap) map.setView(c, map.getZoom(), { animate: false })
    if (ep) {
      cursorInfo.textContent = `${ep.dist_km.toFixed(2)} km from start · ${Math.round(ep.ele_m)} m`
      cursorInfo.style.display = 'block'
    }
    if (chart) {
      const meta = chart.getDatasetMeta(0)
      const pt = meta.data[idx]
      chart.tooltip.setActiveElements(
        [{ datasetIndex: 0, index: idx }],
        pt ? { x: pt.x, y: pt.y } : { x: 0, y: 0 },
      )
      chart.update('none')
    }
  }

  function hideCursor() {
    cursorMarker.setStyle({ opacity: 0, fillOpacity: 0 })
    cursorInfo.style.display = 'none'
    if (chart) {
      chart.tooltip.setActiveElements([], { x: 0, y: 0 })
      chart.update('none')
    }
  }

  let map3d = null
  let map3dReady = false
  let map3dInitializing = false

  function initMap3D() {
    if (map3dInitializing || map3dReady) return
    map3dInitializing = true

    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
    for (const [lon, lat] of geoCoords) {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
    const centerLon = (minLon + maxLon) / 2
    const centerLat = (minLat + maxLat) / 2

    map3d = new maplibregl.Map({
      container: 'map3d',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [centerLon, centerLat],
      zoom: 12,
      pitch: 0,
      bearing: 0,
      antialias: true,
    })

    map3d.on('load', () => {
      map3d.resize()

      map3d.addSource('terrain-dem', {
        type: 'raster-dem',
        encoding: 'terrarium',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 15,
      })
      map3d.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 })

      map3d.addSource('track', {
        type: 'geojson',
        data: trail.geojson,
      })
      map3d.addLayer({
        id: 'track-line',
        type: 'line',
        source: 'track',
        paint: {
          'line-color': '#e74c3c',
          'line-width': 3,
          'line-opacity': 0.9,
        },
      })

      // Start marker (green)
      new maplibregl.Marker({ color: '#27ae60' })
        .setLngLat(geoCoords[0])
        .setPopup(new maplibregl.Popup().setText('Start'))
        .addTo(map3d)

      // End marker (red)
      new maplibregl.Marker({ color: '#e74c3c' })
        .setLngLat(geoCoords[geoCoords.length - 1])
        .setPopup(new maplibregl.Popup().setText('End'))
        .addTo(map3d)

      const bounds = geoCoords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(geoCoords[0], geoCoords[0]),
      )
      map3d.fitBounds(bounds, { padding: 60, pitch: 45, duration: 1000 })

      map3dReady = true
      map3dInitializing = false
    })

    map3d.on('error', () => {
      map3dInitializing = false
    })
  }

  function updateCamera(idx) {
    if (!map3dReady) return
    const coord = geoCoords[idx]           // [lon, lat] — GeoJSON order
    const ele = elevProfile[idx]?.ele_m ?? 0
    const targetIdx = Math.min(idx + 3, geoCoords.length - 1)
    const targetCoord = geoCoords[targetIdx]

    const camera = map3d.getFreeCameraOptions()
    camera.position = maplibregl.MercatorCoordinate.fromLngLat(
      { lng: coord[0], lat: coord[1] },
      ele + 30,
    )
    camera.lookAtPoint({ lng: targetCoord[0], lat: targetCoord[1] })
    map3d.setFreeCameraOptions(camera)

    const scrubBar = document.getElementById('scrubBar')
    const positionLabel = document.getElementById('positionLabel')
    if (scrubBar) scrubBar.value = idx
    if (positionLabel && elevProfile[idx]) {
      positionLabel.textContent = `${elevProfile[idx].dist_km.toFixed(2)} km · ${Math.round(elevProfile[idx].ele_m)} m`
    }
  }

  // Map mouse hover → sync chart
  map.on('mousemove', (e) => {
    let minDist = Infinity, closestIdx = 0
    for (let i = 0; i < coords.length; i++) {
      const d = map.distance(coords[i], e.latlng)
      if (d < minDist) { minDist = d; closestIdx = i }
    }
    moveCursor(closestIdx)
  })
  map.on('mouseout', hideCursor)

  const labels = elevProfile.map(p => p.dist_km.toFixed(1))
  const data = elevProfile.map(p => p.ele_m)

  chart = new Chart(document.getElementById('elevChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#e74c3c',
        backgroundColor: 'rgba(231,76,60,0.15)',
        fill: true,
        pointRadius: 0,
        tension: 0.3,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      onHover: (_event, activeElements) => {
        if (activeElements.length > 0) {
          moveCursor(activeElements[0].index, true)
        } else {
          hideCursor()
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `${items[0].label} km`,
            label: (item) => `${Math.round(item.raw)} m`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Distance (km)', color: '#888' },
          ticks: { maxTicksLimit: 10, color: '#666' },
          grid: { color: '#1e1e1e' },
        },
        y: {
          title: { display: true, text: 'Elevation (m)', color: '#888' },
          ticks: { color: '#666' },
          grid: { color: '#1e1e1e' },
        },
      },
    },
  })

  document.getElementById('chartToggleBtn').addEventListener('click', () => {
    document.getElementById('chartPanel').classList.toggle('collapsed')
  })
}
