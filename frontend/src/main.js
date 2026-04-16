import './style.css'
import { renderUpload } from './upload.js'
import { renderShare } from './share.js'

const path = window.location.pathname
const uuidRE = /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const app = document.getElementById('app')

if (uuidRE.test(path)) {
  renderShare(app, path.slice(1))
} else {
  renderUpload(app)
}
