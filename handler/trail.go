package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"maps.vaz.io/share-gpx/gpx"
	"maps.vaz.io/share-gpx/store"
)

type TrailHandler struct {
	db    *store.DB
	files *store.FileStore
}

func NewTrail(db *store.DB, files *store.FileStore) *TrailHandler {
	return &TrailHandler{db: db, files: files}
}

type trailResponse struct {
	GeoJSON          gpx.GeoJSONFeature   `json:"geojson"`
	Filename         string               `json:"filename"`
	DistanceKm       float64              `json:"distance_km"`
	ElevationGainM   float64              `json:"elevation_gain_m"`
	DurationMin      *float64             `json:"duration_min"`
	ElevationProfile []gpx.ElevationPoint `json:"elevation_profile"`
}

func (h *TrailHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "uuid")

	trail, err := h.db.Get(id)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if trail == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	data, err := h.files.Read(id)
	if err != nil {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}

	parsed, err := gpx.Parse(data)
	if err != nil {
		http.Error(w, "failed to parse GPX", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(trailResponse{
		GeoJSON:          parsed.GeoJSON,
		Filename:         trail.Filename,
		DistanceKm:       parsed.DistanceKm,
		ElevationGainM:   parsed.ElevationGainM,
		DurationMin:      parsed.DurationMin,
		ElevationProfile: parsed.ElevationProfile,
	})
}
