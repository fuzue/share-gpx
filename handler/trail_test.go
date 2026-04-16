package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"maps.vaz.io/share-gpx/handler"
	"maps.vaz.io/share-gpx/store"
)

const trailGPX = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="47.0" lon="8.0"><ele>100</ele><time>2024-01-01T10:00:00Z</time></trkpt><trkpt lat="47.01" lon="8.01"><ele>150</ele><time>2024-01-01T10:30:00Z</time></trkpt></trkseg></trk></gpx>`

func newTestTrailHandler(t *testing.T) (*handler.TrailHandler, string) {
	t.Helper()
	db, err := store.NewDB(":memory:")
	if err != nil {
		t.Fatalf("NewDB: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	tmpDir := t.TempDir()
	fs, err := store.NewFileStore(tmpDir)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}

	testUUID := "aaaabbbb-cccc-dddd-eeee-ffffffffffff"
	if err := fs.Save(testUUID, []byte(trailGPX)); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := db.Insert(store.Trail{UUID: testUUID, Filename: "hike.gpx", SizeBytes: 100}); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	return handler.NewTrail(db, fs), testUUID
}

func chiRequest(method, path, paramName, paramValue string) *http.Request {
	req := httptest.NewRequest(method, path, nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(paramName, paramValue)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func TestTrail_Success(t *testing.T) {
	h, testUUID := newTestTrailHandler(t)
	req := chiRequest(http.MethodGet, "/api/trail/"+testUUID, "uuid", testUUID)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200. body: %s", rr.Code, rr.Body.String())
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp["filename"] != "hike.gpx" {
		t.Errorf("filename: got %v, want hike.gpx", resp["filename"])
	}
	if resp["distance_km"] == nil {
		t.Error("expected distance_km in response")
	}
	if resp["geojson"] == nil {
		t.Error("expected geojson in response")
	}
	if resp["elevation_profile"] == nil {
		t.Error("expected elevation_profile in response")
	}
	if resp["elevation_gain_m"] == nil {
		t.Error("expected elevation_gain_m in response")
	}
	if resp["duration_min"] == nil {
		t.Error("expected duration_min in response (fixture GPX has timestamps)")
	}
}

func TestTrail_ParseError(t *testing.T) {
	db, err := store.NewDB(":memory:")
	if err != nil {
		t.Fatalf("NewDB: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	fs, err := store.NewFileStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}

	badUUID := "bbbbcccc-dddd-eeee-ffff-aaaaaaaaaaaa"
	if err := fs.Save(badUUID, []byte("not valid xml")); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := db.Insert(store.Trail{UUID: badUUID, Filename: "bad.gpx", SizeBytes: 13}); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	h := handler.NewTrail(db, fs)
	req := chiRequest(http.MethodGet, "/api/trail/"+badUUID, "uuid", badUUID)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("status: got %d, want 500", rr.Code)
	}
}

func TestTrail_NotFound(t *testing.T) {
	h, _ := newTestTrailHandler(t)
	req := chiRequest(http.MethodGet, "/api/trail/missing", "uuid", "missing")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want 404", rr.Code)
	}
}
