import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } from 'chart.js'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { mountExplore } from './explore.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

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
        <div id="mapExplore" class="map hidden"></div>
        <button id="toggleView" class="toggle-view-btn">Map</button>
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
  const statParts = [`📏 ${trail.distance_km} km`, `⛰️ ${trail.elevation_gain_m} m ↑`]
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

  const cursorMarker = L.circleMarker([0, 0], {
    radius: 6, color: '#fff', fillColor: '#f39c12', fillOpacity: 1, weight: 2, interactive: false,
  }).addTo(map)
  cursorMarker.setStyle({ opacity: 0, fillOpacity: 0 })

  const cursorInfo = document.createElement('div')
  cursorInfo.style.cssText = 'position:absolute;bottom:12px;left:12px;z-index:1001;background:rgba(0,0,0,0.75);color:#fff;padding:4px 10px;border-radius:4px;font-size:13px;display:none;pointer-events:none'
  document.getElementById('map').appendChild(cursorInfo)

  const elevProfile = trail.elevation_profile ?? []
  let chart = null
  let chartCursorIdx = null

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

  map.on('mousemove', (e) => {
    let minDist = Infinity, closestIdx = 0
    for (let i = 0; i < coords.length; i++) {
      const d = map.distance(coords[i], e.latlng)
      if (d < minDist) { minDist = d; closestIdx = i }
    }
    moveCursor(closestIdx)
  })
  map.on('mouseout', hideCursor)

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

  chart = new Chart(document.getElementById('elevChart'), {
    plugins: [chartCursorPlugin],
    type: 'line',
    data: {
      labels: elevProfile.map(p => p.dist_km.toFixed(1)),
      datasets: [{
        data: elevProfile.map(p => p.ele_m),
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
        if (activeElements.length > 0) moveCursor(activeElements[0].index, true)
        else hideCursor()
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

  let mode = '2d'
  let exploreCleanup = null

  function updateURL() {
    const params = new URLSearchParams(window.location.search)
    if (mode === 'explore') params.set('view', 'map')
    else params.delete('view')
    if (document.getElementById('chartPanel').classList.contains('collapsed')) params.set('chart', '0')
    else params.delete('chart')
    const url = new URL(window.location.href)
    url.search = params.toString()
    history.replaceState(null, '', url)
  }

  function enterExplore() {
    mode = 'explore'
    document.getElementById('map').classList.add('hidden')
    document.getElementById('chartPanel').style.display = 'none'
    document.getElementById('mapExplore').classList.remove('hidden')
    document.getElementById('toggleView').textContent = '2D'
    exploreCleanup = mountExplore(document.getElementById('mapExplore'), trail)
    updateURL()
  }

  function exitExplore() {
    exploreCleanup?.()
    exploreCleanup = null
    mode = '2d'
    document.getElementById('mapExplore').classList.add('hidden')
    document.getElementById('map').classList.remove('hidden')
    document.getElementById('chartPanel').style.display = ''
    document.getElementById('toggleView').textContent = 'Map'
    map.invalidateSize()
    updateURL()
  }

  if (coords.length > 1) {
    document.getElementById('toggleView').addEventListener('click', () => {
      if (mode === '2d') enterExplore()
      else exitExplore()
    })
  } else {
    const btn = document.getElementById('toggleView')
    btn.disabled = true
    btn.title = 'Not enough trackpoints for 3D view'
    btn.style.opacity = '0.4'
    btn.style.cursor = 'not-allowed'
  }

  if (initParams.get('view') === 'map' && coords.length > 1) {
    enterExplore()
  }
  if (initParams.get('chart') === '0') {
    document.getElementById('chartPanel').classList.add('collapsed')
  }
}
