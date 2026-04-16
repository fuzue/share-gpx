package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"maps.vaz.io/share-gpx/store"
)

type UploadHandler struct {
	apiKey    string
	db        *store.DB
	files     *store.FileStore
	publicURL string
}

func NewUpload(apiKey string, db *store.DB, files *store.FileStore, publicURL string) *UploadHandler {
	return &UploadHandler{apiKey: apiKey, db: db, files: files, publicURL: publicURL}
}

func (h *UploadHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-API-Key") != h.apiKey {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "missing file field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".gpx") {
		http.Error(w, "only .gpx files accepted", http.StatusBadRequest)
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "failed to read file", http.StatusInternalServerError)
		return
	}

	id := uuid.New().String()

	if err := h.files.Save(id, data); err != nil {
		http.Error(w, "failed to save file", http.StatusInternalServerError)
		return
	}

	if err := h.db.Insert(store.Trail{
		UUID:       id,
		Filename:   header.Filename,
		UploadedAt: time.Now().UTC(),
		SizeBytes:  int64(len(data)),
	}); err != nil {
		http.Error(w, "failed to save metadata", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"url": fmt.Sprintf("%s/%s", h.publicURL, id),
	})
}
