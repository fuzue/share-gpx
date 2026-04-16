package gpx_test

import (
	"testing"

	"maps.vaz.io/share-gpx/gpx"
)

const sampleGPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="47.0" lon="8.0"><ele>100</ele><time>2024-01-01T10:00:00Z</time></trkpt>
    <trkpt lat="47.01" lon="8.01"><ele>150</ele><time>2024-01-01T10:30:00Z</time></trkpt>
    <trkpt lat="47.02" lon="8.02"><ele>120</ele><time>2024-01-01T11:00:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`

const noTimeGPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="47.0" lon="8.0"><ele>100</ele></trkpt>
    <trkpt lat="47.01" lon="8.01"><ele>110</ele></trkpt>
  </trkseg></trk>
</gpx>`

func TestParse_Distance(t *testing.T) {
	r, err := gpx.Parse([]byte(sampleGPX))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if r.DistanceKm <= 0 {
		t.Errorf("expected positive distance, got %v", r.DistanceKm)
	}
}

func TestParse_ElevationGain(t *testing.T) {
	r, err := gpx.Parse([]byte(sampleGPX))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	// 100→150 = +50m gain; 150→120 = -30m (not counted)
	if r.ElevationGainM != 50 {
		t.Errorf("elevation gain: got %v, want 50", r.ElevationGainM)
	}
}

func TestParse_Duration(t *testing.T) {
	r, err := gpx.Parse([]byte(sampleGPX))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if r.DurationMin == nil {
		t.Fatal("expected non-nil duration")
	}
	if *r.DurationMin != 60 {
		t.Errorf("duration: got %v, want 60", *r.DurationMin)
	}
}

func TestParse_DurationNilWithoutTimestamps(t *testing.T) {
	r, err := gpx.Parse([]byte(noTimeGPX))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if r.DurationMin != nil {
		t.Errorf("expected nil duration, got %v", *r.DurationMin)
	}
}

func TestParse_GeoJSON(t *testing.T) {
	r, err := gpx.Parse([]byte(sampleGPX))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if r.GeoJSON.Type != "Feature" {
		t.Errorf("type: got %q, want Feature", r.GeoJSON.Type)
	}
	if r.GeoJSON.Geometry.Type != "LineString" {
		t.Errorf("geometry type: got %q, want LineString", r.GeoJSON.Geometry.Type)
	}
	if len(r.GeoJSON.Geometry.Coordinates) != 3 {
		t.Errorf("coords len: got %d, want 3", len(r.GeoJSON.Geometry.Coordinates))
	}
	// GeoJSON is [lon, lat]
	if r.GeoJSON.Geometry.Coordinates[0][0] != 8.0 {
		t.Errorf("first coord lon: got %v, want 8.0", r.GeoJSON.Geometry.Coordinates[0][0])
	}
	if r.GeoJSON.Geometry.Coordinates[0][1] != 47.0 {
		t.Errorf("first coord lat: got %v, want 47.0", r.GeoJSON.Geometry.Coordinates[0][1])
	}
}

func TestParse_ElevationProfile(t *testing.T) {
	r, err := gpx.Parse([]byte(sampleGPX))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if len(r.ElevationProfile) != 3 {
		t.Errorf("profile len: got %d, want 3", len(r.ElevationProfile))
	}
	if r.ElevationProfile[0].DistKm != 0 {
		t.Errorf("first profile dist: got %v, want 0", r.ElevationProfile[0].DistKm)
	}
	if r.ElevationProfile[0].EleM != 100 {
		t.Errorf("first profile ele: got %v, want 100", r.ElevationProfile[0].EleM)
	}
}
