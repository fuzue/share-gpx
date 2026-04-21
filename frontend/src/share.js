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
  const initParams = new URLSearchParams(window.location.search)

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

  if (coords.length <= 1) {
    const btn = document.getElementById('toggleView')
    btn.disabled = true
    btn.title = 'Not enough trackpoints for 3D view'
    btn.style.opacity = '0.4'
    btn.style.cursor = 'not-allowed'
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
      chartCursorIdx = idx
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
      chartCursorIdx = null
      chart.tooltip.setActiveElements([], { x: 0, y: 0 })
      chart.update('none')
    }
  }

  let map3d = null
  let map3dReady = false
  let map3dInitializing = false
  let cameraBearingOffset = 0
  let cameraPitch = 75
  let posMarker3d = null
  let cameraZoom = 16

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
      style: {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            attribution: '© Esri',
            maxzoom: 19,
          },
        },
        layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
      },
      center: [centerLon, centerLat],
      zoom: 12,
      pitch: 0,
      bearing: 0,
      antialias: true,
      maxPitch: 85,
    })

    map3d.on('load', () => {
      const m = map3d  // local ref — immune to error handler setting map3d = null
      m.resize()

      m.setSky({
        'sky-color': '#4a9fd4',
        'horizon-color': '#b8d8f0',
        'fog-color': '#d4e8f5',
        'fog-ground-blend': 0.5,
        'sky-horizon-blend': 0.4,
        'atmosphere-blend': 0.8,
      })

      m.addSource('terrain-dem', {
        type: 'raster-dem',
        encoding: 'terrarium',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 15,
      })
      m.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 })

      m.addSource('track', {
        type: 'geojson',
        data: trail.geojson,
      })
      m.addLayer({
        id: 'track-line',
        type: 'line',
        source: 'track',
        paint: {
          'line-color': '#e74c3c',
          'line-width': 3,
          'line-opacity': 0.9,
        },
      })

      // Arrow marker showing current playback position and travel direction
      const arrowEl = document.createElement('div')
      arrowEl.innerHTML = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="12" fill="#f39c12" stroke="white" stroke-width="2"/><polygon points="14,4 20,18 14,13 8,18" fill="white"/></svg>`
      arrowEl.style.cssText = 'pointer-events:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.8));'
      posMarker3d = new maplibregl.Marker({ element: arrowEl, rotationAlignment: 'map', pitchAlignment: 'map' })
        .setLngLat(geoCoords[0])
        .addTo(m)

      // Place markers after first idle so terrain elevation is queryable
      m.once('idle', () => {
        const startEle = m.queryTerrainElevation(geoCoords[0]) ?? 0
        const endEle = m.queryTerrainElevation(geoCoords[geoCoords.length - 1]) ?? 0
        new maplibregl.Marker({ color: '#27ae60' })
          .setLngLat([geoCoords[0][0], geoCoords[0][1], startEle])
          .setPopup(new maplibregl.Popup().setText('Start'))
          .addTo(m)
        new maplibregl.Marker({ color: '#e74c3c' })
          .setLngLat([geoCoords[geoCoords.length - 1][0], geoCoords[geoCoords.length - 1][1], endEle])
          .setPopup(new maplibregl.Popup().setText('End'))
          .addTo(m)
      })

      const bounds = geoCoords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(geoCoords[0], geoCoords[0]),
      )
      // cameraForBounds is synchronous — no race with fitBounds/easeTo
      const overviewCam = m.cameraForBounds(bounds, { padding: 60 }) ?? { center: { lng: centerLon, lat: centerLat }, zoom: 12 }

      if (initParams.has('bearing') || initParams.has('idx')) {
        const savedBearing = initParams.has('bearing') ? parseFloat(initParams.get('bearing')) : 0
        if (initParams.has('pitch')) cameraPitch = parseFloat(initParams.get('pitch'))
        if (initParams.has('zoom')) cameraZoom = Math.max(13, parseFloat(initParams.get('zoom')))
        if (initParams.has('idx')) {
          // Follow-cam: center on trail point with full saved camera state
          const coord = geoCoords[currentIdx]
          const ti = Math.min(currentIdx + 3, geoCoords.length - 1)
          const tc = geoCoords[ti]
          const dLon = (tc[0] - coord[0]) * Math.PI / 180
          const φ1 = coord[1] * Math.PI / 180, φ2 = tc[1] * Math.PI / 180
          const trailBear = (Math.atan2(Math.sin(dLon) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon)) * 180 / Math.PI + 360) % 360
          cameraBearingOffset = ((savedBearing - trailBear) + 360) % 360
          if (posMarker3d) posMarker3d.setLngLat([coord[0], coord[1]])
          if (positionLabel && elevProfile[currentIdx]) {
            positionLabel.textContent = `${elevProfile[currentIdx].dist_km.toFixed(2)} km · ${Math.round(elevProfile[currentIdx].ele_m)} m`
          }
          moveCursor(currentIdx)
          m.jumpTo({ center: [coord[0], coord[1]], bearing: savedBearing, pitch: cameraPitch, zoom: cameraZoom })
        } else {
          // Overview with saved camera — use overview zoom (safe distance) but restore pitch/bearing
          cameraBearingOffset = savedBearing
          m.jumpTo({ center: [overviewCam.center.lng, overviewCam.center.lat], zoom: overviewCam.zoom, bearing: savedBearing, pitch: cameraPitch })
        }
      } else {
        // No URL params — default trail overview
        m.jumpTo({ center: [overviewCam.center.lng, overviewCam.center.lat], zoom: overviewCam.zoom, pitch: 0, bearing: 0 })
      }

      map3dReady = true
      map3dInitializing = false

      // Disable all built-in interactions; we handle everything ourselves
      m.dragPan.disable()
      m.dragRotate.disable()
      m.touchZoomRotate.disable()
      m.touchPitch.disable()
      m.scrollZoom.disable()

      // Pointer events: single-finger = bearing/pitch, two-finger = pinch zoom
      const map3dEl = document.getElementById('map3d')
      const activePointers = new Map()
      let dragPt = null
      let pinchState = null

      map3dEl.addEventListener('pointerdown', e => {
        e.preventDefault()
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        map3dEl.setPointerCapture(e.pointerId)
        if (activePointers.size === 1) {
          dragPt = { x: e.clientX, y: e.clientY, bearing: cameraBearingOffset, pitch: cameraPitch }
          pinchState = null
        } else if (activePointers.size === 2) {
          dragPt = null
          const [a, b] = [...activePointers.values()]
          pinchState = { dist: Math.hypot(b.x - a.x, b.y - a.y), zoom: cameraZoom }
        }
      }, { passive: false })

      map3dEl.addEventListener('pointermove', e => {
        e.preventDefault()
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (activePointers.size === 2 && pinchState) {
          const [a, b] = [...activePointers.values()]
          const dist = Math.hypot(b.x - a.x, b.y - a.y)
          cameraZoom = Math.max(13, Math.min(20, pinchState.zoom + Math.log2(dist / pinchState.dist)))
          if (playing) updateCamera(currentIdx)
          else map3d.jumpTo({ zoom: cameraZoom })
        } else if (dragPt) {
          const dx = e.clientX - dragPt.x
          const dy = e.clientY - dragPt.y
          cameraBearingOffset = ((dragPt.bearing - dx * 0.4) % 360 + 360) % 360
          cameraPitch = Math.max(0, Math.min(85, dragPt.pitch - dy * 0.3))
          if (playing) updateCamera(currentIdx)
          else map3d.jumpTo({ bearing: cameraBearingOffset, pitch: cameraPitch })
        }
      }, { passive: false })

      map3dEl.addEventListener('pointerup', e => {
        activePointers.delete(e.pointerId)
        map3dEl.releasePointerCapture(e.pointerId)
        if (activePointers.size === 0) { dragPt = null; pinchState = null; updateURL() }
        else if (activePointers.size === 1) {
          pinchState = null
          const [pt] = [...activePointers.values()]
          dragPt = { x: pt.x, y: pt.y, bearing: cameraBearingOffset, pitch: cameraPitch }
        }
      })
      map3dEl.addEventListener('pointercancel', e => {
        activePointers.delete(e.pointerId)
        if (activePointers.size === 0) { dragPt = null; pinchState = null }
      })

      // Scroll wheel zoom (desktop)
      map3dEl.addEventListener('wheel', e => {
        cameraZoom = Math.max(13, Math.min(20, cameraZoom - e.deltaY * 0.005))
        if (playing) updateCamera(currentIdx)
        else map3d.jumpTo({ zoom: cameraZoom })
        clearTimeout(wheelTimer)
        wheelTimer = setTimeout(updateURL, 400)
        e.preventDefault()
      }, { passive: false })
    })

    map3d.on('error', () => {
      map3dInitializing = false
      map3d = null
    })
  }

  function updateCamera(idx) {
    if (!map3dReady) return
    const coord = geoCoords[idx]
    const targetIdx = Math.min(idx + 3, geoCoords.length - 1)
    const targetCoord = geoCoords[targetIdx]

    // Compute bearing toward the look-ahead point
    const dLon = (targetCoord[0] - coord[0]) * Math.PI / 180
    const lat1 = coord[1] * Math.PI / 180
    const lat2 = targetCoord[1] * Math.PI / 180
    const y = Math.sin(dLon) * Math.cos(lat2)
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
    const bear = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360

    map3d.jumpTo({ center: [coord[0], coord[1]], zoom: cameraZoom, bearing: (bear + cameraBearingOffset) % 360, pitch: cameraPitch })

    if (posMarker3d) {
      posMarker3d.setLngLat([coord[0], coord[1]])
      posMarker3d.setRotation(bear)
    }

    if (scrubBar) scrubBar.value = idx
    if (positionLabel && elevProfile[idx]) {
      positionLabel.textContent = `${elevProfile[idx].dist_km.toFixed(2)} km · ${Math.round(elevProfile[idx].ele_m)} m`
    }
    moveCursor(idx)
  }

  let playing = false
  let currentIdx = 0
  let animFrame = null
  let playbackAccum = 0

  // Points per second at each speed setting (1× ≈ 10 pts/sec feels like slow flythrough)
  const PTS_PER_SEC = { '1': 10, '2': 25, '5': 60, '10': 150 }

  function playbackStep() {
    const pps = PTS_PER_SEC[speedSelect?.value] ?? 10
    playbackAccum += pps / 60
    const steps = Math.floor(playbackAccum)
    if (steps > 0) {
      playbackAccum -= steps
      currentIdx = Math.min(currentIdx + steps, coords.length - 1)
      updateCamera(currentIdx)
    }
    if (currentIdx < coords.length - 1) {
      animFrame = requestAnimationFrame(playbackStep)
    } else {
      playing = false
      if (playPauseBtn) playPauseBtn.textContent = '▶'
    }
  }

  function togglePlay() {
    if (playing) {
      playing = false
      cancelAnimationFrame(animFrame)
      animFrame = null
      const btn = playPauseBtn
      if (btn) btn.textContent = '▶'
      updateURL()
    } else {
      if (currentIdx >= coords.length - 1) currentIdx = 0
      playbackAccum = 0
      playing = true
      const btn = playPauseBtn
      if (btn) btn.textContent = '⏸'
      updateCamera(currentIdx)
      animFrame = requestAnimationFrame(playbackStep)
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

  // Vertical cursor line drawn on the chart at the active index
  let chartCursorIdx = null
  const chartCursorPlugin = {
    id: 'cursorLine',
    afterDraw(ch) {
      if (chartCursorIdx == null) return
      const { ctx, chartArea: { top, bottom }, scales: { x } } = ch
      const xPx = x.getPixelForValue(chartCursorIdx)
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(xPx, top)
      ctx.lineTo(xPx, bottom)
      ctx.strokeStyle = '#f39c12'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    },
  }

  const labels = elevProfile.map(p => p.dist_km.toFixed(1))
  const data = elevProfile.map(p => p.ele_m)

  chart = new Chart(document.getElementById('elevChart'), {
    plugins: [chartCursorPlugin],
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
    updateURL()
  })

  const scrubBar = document.getElementById('scrubBar')
  scrubBar.max = coords.length - 1
  const positionLabel = document.getElementById('positionLabel')
  const speedSelect = document.getElementById('speedSelect')
  const playPauseBtn = document.getElementById('playPauseBtn')

  let wasPlayingBeforeScrub = false
  scrubBar.addEventListener('pointerdown', () => {
    wasPlayingBeforeScrub = playing
    if (playing) {
      playing = false
      cancelAnimationFrame(animFrame)
      animFrame = null
      playPauseBtn.textContent = '▶'
    }
  })
  scrubBar.addEventListener('input', () => {
    currentIdx = parseInt(scrubBar.value, 10)
    updateCamera(currentIdx)
  })
  scrubBar.addEventListener('pointerup', () => {
    if (wasPlayingBeforeScrub) togglePlay()
    else updateURL()
  })

  playPauseBtn.addEventListener('click', togglePlay)

  let mode = '2d'
  let wheelTimer = null

  function updateURL() {
    const params = new URLSearchParams()
    if (mode === '3d') {
      params.set('view', '3d')
      params.set('bearing', (map3d && map3dReady) ? Math.round(map3d.getBearing()) : Math.round(cameraBearingOffset))
      params.set('pitch', Math.round(cameraPitch))
      params.set('zoom', cameraZoom.toFixed(1))
      if (currentIdx > 0) params.set('idx', currentIdx)
    }
    if (document.getElementById('chartPanel').classList.contains('collapsed')) params.set('chart', '0')
    const url = new URL(window.location.href)
    url.search = params.toString()
    history.replaceState(null, '', url)
  }

  if (coords.length > 1) {
    document.getElementById('toggleView').addEventListener('click', () => {
      if (mode === '2d') {
        mode = '3d'
        document.getElementById('map').classList.add('hidden')
        document.getElementById('map3d').classList.remove('hidden')
        document.getElementById('playbackOverlay').classList.remove('hidden')
        document.getElementById('toggleView').textContent = '2D'
        initMap3D()
        if (map3dReady) map3d.resize()
        updateURL()
      } else {
        mode = '2d'
        if (playing) togglePlay()
        document.getElementById('map3d').classList.add('hidden')
        document.getElementById('map').classList.remove('hidden')
        document.getElementById('playbackOverlay').classList.add('hidden')
        document.getElementById('toggleView').textContent = '3D'
        map.invalidateSize()
        updateURL()
      }
    })
  }

  // Restore UI state from URL params
  if (initParams.get('view') === '3d' && coords.length > 1) {
    if (initParams.has('idx')) {
      currentIdx = Math.min(parseInt(initParams.get('idx'), 10) || 0, coords.length - 1)
      scrubBar.value = currentIdx
    }
    mode = '3d'
    document.getElementById('map').classList.add('hidden')
    document.getElementById('map3d').classList.remove('hidden')
    document.getElementById('playbackOverlay').classList.remove('hidden')
    document.getElementById('toggleView').textContent = '2D'
    initMap3D()
  }
  if (initParams.get('chart') === '0') {
    document.getElementById('chartPanel').classList.add('collapsed')
  }
}
