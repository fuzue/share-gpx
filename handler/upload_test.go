package handler_test

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"maps.vaz.io/share-gpx/handler"
	"maps.vaz.io/share-gpx/store"
)

func newTestUploadHandler(t *testing.T) *handler.UploadHandler {
	t.Helper()
	db, err := store.NewDB(":memory:")
	if err != nil {
		t.Fatalf("NewDB: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	fs, err := store.NewFileStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}

	return handler.NewUpload("secret-key", db, fs, "https://maps.vaz.io")
}

func makeUploadRequest(t *testing.T, filename, content, apiKey string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fw, _ := w.CreateFormFile("file", filename)
	fw.Write([]byte(content))
	w.Close()

	req := httptest.NewRequest(http.MethodPost, "/upload", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	if apiKey != "" {
		req.Header.Set("X-API-Key", apiKey)
	}
	return req
}

const minimalGPX = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="47.0" lon="8.0"><ele>100</ele></trkpt></trkseg></trk></gpx>`

func TestUpload_Success(t *testing.T) {
	h := newTestUploadHandler(t)
	req := makeUploadRequest(t, "trail.gpx", minimalGPX, "secret-key")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200. body: %s", rr.Code, rr.Body.String())
	}
	var resp map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !strings.HasPrefix(resp["url"], "https://maps.vaz.io/") {
		t.Errorf("url: got %q, want prefix https://maps.vaz.io/", resp["url"])
	}
}

func TestUpload_WrongAPIKey(t *testing.T) {
	h := newTestUploadHandler(t)
	req := makeUploadRequest(t, "trail.gpx", minimalGPX, "wrong-key")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("status: got %d, want 401", rr.Code)
	}
}

func TestUpload_MissingAPIKey(t *testing.T) {
	h := newTestUploadHandler(t)
	req := makeUploadRequest(t, "trail.gpx", minimalGPX, "")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("status: got %d, want 401", rr.Code)
	}
}

func TestUpload_NonGPXFile(t *testing.T) {
	h := newTestUploadHandler(t)
	req := makeUploadRequest(t, "trail.txt", "not gpx", "secret-key")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want 400", rr.Code)
	}
}
