export function renderUpload(app) {
  app.innerHTML = `
    <div class="upload-wrapper">
      <div class="upload-card">
        <h1>Share a GPX Trail</h1>
        <div class="drop-zone" id="dropZone">
          <span id="dropLabel">Drop .gpx file here or <label for="fileInput">browse</label></span>
          <input type="file" id="fileInput" accept=".gpx" hidden />
        </div>
        <input type="password" id="apiKey" class="api-key-input" placeholder="API key" autocomplete="current-password" />
        <button id="uploadBtn" class="upload-btn" disabled>Upload</button>
        <div id="result" class="result hidden"></div>
      </div>
    </div>
  `

  const dropZone = document.getElementById('dropZone')
  const fileInput = document.getElementById('fileInput')
  const dropLabel = document.getElementById('dropLabel')
  const apiKeyInput = document.getElementById('apiKey')
  const uploadBtn = document.getElementById('uploadBtn')
  const result = document.getElementById('result')

  apiKeyInput.value = localStorage.getItem('gpx-api-key') || ''
  let selectedFile = null

  function updateBtn() {
    uploadBtn.disabled = !selectedFile || !apiKeyInput.value.trim()
  }

  dropZone.addEventListener('click', (e) => {
    if (e.target !== document.querySelector('label[for="fileInput"]')) {
      fileInput.click()
    }
  })

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropZone.classList.add('drag-over')
  })

  dropZone.addEventListener('dragleave', (e) => {
    if (!dropZone.contains(e.relatedTarget)) {
      dropZone.classList.remove('drag-over')
    }
  })

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropZone.classList.remove('drag-over')
    const file = e.dataTransfer.files[0]
    if (file && file.name.toLowerCase().endsWith('.gpx')) {
      setFile(file)
    } else if (file) {
      const original = dropLabel.textContent
      dropLabel.textContent = 'Only .gpx files are accepted'
      setTimeout(() => { dropLabel.textContent = original }, 2500)
    }
  })

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) setFile(fileInput.files[0])
  })

  function setFile(file) {
    selectedFile = file
    dropLabel.textContent = file.name
    updateBtn()
  }

  apiKeyInput.addEventListener('input', updateBtn)

  updateBtn()

  uploadBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim()
    localStorage.setItem('gpx-api-key', key)
    uploadBtn.disabled = true
    uploadBtn.textContent = 'Uploading\u2026'
    result.classList.add('hidden')

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const res = await fetch('/upload', {
        method: 'POST',
        headers: { 'X-API-Key': key },
        body: formData,
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text.trim() || `HTTP ${res.status}`)
      }

      const { url } = await res.json()
      result.classList.remove('hidden')
      result.textContent = ''

      const label = document.createElement('span')
      label.textContent = 'Trail shared!'
      result.appendChild(label)

      const link = document.createElement('a')
      link.href = url
      link.textContent = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      result.appendChild(link)

      const copyBtn = document.createElement('button')
      copyBtn.id = 'copyBtn'
      copyBtn.textContent = 'Copy link'
      copyBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(url).then(() => { this.textContent = 'Copied!' }).catch(() => {})
      })
      result.appendChild(copyBtn)
    } catch (err) {
      result.classList.remove('hidden')
      result.textContent = ''
      const errSpan = document.createElement('span')
      errSpan.className = 'error'
      errSpan.textContent = `Upload failed: ${err.message}`
      result.appendChild(errSpan)
    } finally {
      uploadBtn.disabled = false
      uploadBtn.textContent = 'Upload'
    }
  })
}
