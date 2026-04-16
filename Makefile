.PHONY: build frontend test run

build: frontend
	go build -o share-gpx .

frontend:
	cd frontend && npm install && npm run build

test:
	go test ./...

run: build
	API_KEY=dev DATA_DIR=/tmp/share-gpx-dev PORT=8080 PUBLIC_URL=http://localhost:8080 ./share-gpx
