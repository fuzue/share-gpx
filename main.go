package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"maps.vaz.io/share-gpx/handler"
	"maps.vaz.io/share-gpx/store"
)

//go:embed all:dist
var distFS embed.FS

func main() {
	apiKey := mustEnv("API_KEY")
	dataDir := envOr("DATA_DIR", "/data")
	port := envOr("PORT", "8080")
	publicURL := envOr("PUBLIC_URL", "http://localhost:"+port)

	db, err := store.NewDB(filepath.Join(dataDir, "trails.db"))
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	files, err := store.NewFileStore(dataDir)
	if err != nil {
		log.Fatalf("init file store: %v", err)
	}

	subFS, err := fs.Sub(distFS, "dist")
	if err != nil {
		log.Fatalf("embed sub: %v", err)
	}

	r := chi.NewRouter()
	r.Post("/upload", handler.NewUpload(apiKey, db, files, publicURL).ServeHTTP)
	r.Get("/api/trail/{uuid}", handler.NewTrail(db, files).ServeHTTP)
	r.Handle("/assets/*", http.FileServerFS(subFS))
	r.Get("/", handler.NewSPA(subFS).ServeHTTP)
	r.Get("/{uuid}", handler.NewSPA(subFS).ServeHTTP)

	log.Printf("listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("required env var %s is not set", key)
	}
	return v
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
