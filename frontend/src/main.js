import './style.css'
import { renderUpload } from './upload.js'

const path = window.location.pathname
const uuidRE = /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const app = document.getElementById('app')

if (uuidRE.test(path)) {
  app.textContent = 'Share view coming soon…'
} else {
  renderUpload(app)
}
