package store

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type FileStore struct {
	dir string
}

func NewFileStore(dataDir string) (*FileStore, error) {
	dir := filepath.Join(dataDir, "gpx")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	return &FileStore{dir: dir}, nil
}

func (f *FileStore) Save(uuid string, data []byte) error {
	if strings.ContainsAny(uuid, "/\\") {
		return fmt.Errorf("invalid uuid: %q", uuid)
	}
	return os.WriteFile(filepath.Join(f.dir, uuid+".gpx"), data, 0644)
}

func (f *FileStore) Read(uuid string) ([]byte, error) {
	if strings.ContainsAny(uuid, "/\\") {
		return nil, fmt.Errorf("invalid uuid: %q", uuid)
	}
	return os.ReadFile(filepath.Join(f.dir, uuid+".gpx"))
}
