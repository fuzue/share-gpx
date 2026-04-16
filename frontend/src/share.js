import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { Chart, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } from 'chart.js'

Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

// Leaflet's default icon assets break with bundlers; point to CDN instead
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export async function renderShare(app, uuid) {
  app.innerHTML = `
    <div class="share-wrapper">
      <div id="map" class="map"></div>
      <div class="stats-overlay" id="statsOverlay"></div>
      <div class="chart-panel">
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

  document.title = trail.filename || 'GPX Trail'

  const map = L.map('map')
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map)

  const coords = trail.geojson.geometry.coordinates.map(([lon, lat]) => [lat, lon])
  const polyline = L.polyline(coords, { color: '#e74c3c', weight: 3 }).addTo(map)
  map.fitBounds(polyline.getBounds(), { padding: [40, 40] })

  const greenIcon = L.divIcon({ className: '', html: '<div style="width:12px;height:12px;border-radius:50%;background:#27ae60;border:2px solid #fff;"></div>' })
  const redIcon = L.divIcon({ className: '', html: '<div style="width:12px;height:12px;border-radius:50%;background:#e74c3c;border:2px solid #fff;"></div>' })
  L.marker(coords[0], { icon: greenIcon }).bindTooltip('Start').addTo(map)
  L.marker(coords[coords.length - 1], { icon: redIcon }).bindTooltip('End').addTo(map)

  const stats = document.getElementById('statsOverlay')
  const parts = [
    `📏 ${trail.distance_km} km`,
    `⛰️ ${trail.elevation_gain_m} m ↑`,
  ]
  if (trail.duration_min != null) {
    const h = Math.floor(trail.duration_min / 60)
    const m = Math.round(trail.duration_min % 60)
    parts.push(`⏱️ ${h > 0 ? h + 'h ' : ''}${m}m`)
  }
  stats.innerHTML = parts.map(p => `<span>${p}</span>`).join('')

  const labels = trail.elevation_profile.map(p => p.dist_km.toFixed(1))
  const data = trail.elevation_profile.map(p => p.ele_m)

  new Chart(document.getElementById('elevChart'), {
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
      plugins: { legend: { display: false } },
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
}
