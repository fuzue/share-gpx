# share-gpx

A self-hosted service for sharing GPX trails with interactive maps. Upload a GPX file and get a shareable link with a 2D map, elevation profile, and 3D first-person terrain flythrough.

![3D terrain flythrough with first-person playback](share-gpx-3d.gif)

## Features

- **Drag-and-drop upload** — simple web UI for uploading `.gpx` files
- **Interactive 2D map** — trail rendered on OpenStreetMap with start/end markers, hover to see elevation and distance
- **Elevation profile** — chart showing elevation vs. distance along the trail
- **3D terrain view** — WebGL terrain with satellite, topographic, street, and dark basemap styles
- **First-person playback** — animated camera follows the trail at 1×, 2×, 5×, or 10× speed
- **Trail stats** — distance, elevation gain, and duration at a glance
- **Shareable URLs** — every trail gets a unique UUID-based URL; view state (map position, 3D mode, playback) is preserved in query params
- **Single binary** — Go backend with embedded frontend; no separate asset server needed

## Quick Start

```bash
# Build (requires Go 1.21+ and Node.js 16+)
make build

# Run
API_KEY=your-secret-key ./share-gpx
```

Open `http://localhost:8080`, enter your API key, and drop a `.gpx` file.

## Installation

### From source

```bash
git clone https://github.com/fuzue/share-gpx
cd share-gpx

# Install frontend dependencies and build
cd frontend && npm install && npm run build && cd ..

# Build the Go binary (embeds the built frontend)
go build -o share-gpx .
```

Or use the Makefile shortcut:

```bash
make build
```

### Docker (example)

```dockerfile
FROM golang:1.21-alpine AS build
WORKDIR /app
COPY . .
RUN apk add --no-cache nodejs npm make
RUN make build

FROM alpine:latest
COPY --from=build /app/share-gpx /usr/local/bin/share-gpx
ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080
CMD ["share-gpx"]
```

## Configuration

All configuration is via environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | **yes** | — | Secret key required to upload files |
| `DATA_DIR` | no | `/data` | Directory where GPX files and the SQLite database are stored |
| `PORT` | no | `8080` | HTTP listen port |
| `PUBLIC_URL` | no | `http://localhost:{PORT}` | Base URL used in upload responses (set this to your public domain) |

Example production setup:

```bash
export API_KEY="$(openssl rand -hex 32)"
export DATA_DIR="/var/lib/share-gpx"
export PORT="8080"
export PUBLIC_URL="https://trails.example.com"
./share-gpx
```

## Usage

### Uploading a trail

**Via the web UI:** Open the root URL, enter your API key once (it's saved in browser storage), then drag and drop a `.gpx` file. You'll receive a shareable link.

**Via curl:**

```bash
curl -X POST https://your-domain.com/upload \
  -H "X-API-Key: your-secret-key" \
  -F "file=@trail.gpx"
# {"url":"https://your-domain.com/550e8400-e29b-41d4-a716-446655440000"}
```

### Viewing a trail

Open the returned URL in any browser. Toggle between 2D and 3D views with the button in the top-right corner. In 3D mode, use the playback controls at the bottom to fly through the trail.

## API

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/upload` | POST | `X-API-Key` header | Upload a GPX file; returns `{"url": "..."}` |
| `/api/trail/:uuid` | GET | none | Returns trail GeoJSON, stats, and elevation profile as JSON |
| `/:uuid` | GET | none | Serves the SPA shell for trail viewing |

## Development

```bash
# Start the Go backend
API_KEY=dev DATA_DIR=/tmp/share-gpx PORT=8087 PUBLIC_URL=http://localhost:8087 go run .

# Start the Vite dev server (hot reload)
cd frontend && npm run dev
```

The Vite dev server proxies API calls to the Go backend automatically.

```bash
# Run Go tests
go test ./...
```

## Tech Stack

- **Backend:** Go, [chi](https://github.com/go-chi/chi), [modernc/sqlite](https://gitlab.com/cznic/sqlite) (pure Go, no CGo)
- **Frontend:** [Vite](https://vitejs.dev/), [Leaflet](https://leafletjs.com/), [MapLibre GL JS](https://maplibre.org/), [Chart.js](https://www.chartjs.org/)
- **Storage:** SQLite (metadata) + filesystem (GPX files)

## License

MIT — see [LICENSE](LICENSE).
