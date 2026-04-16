package store_test

import (
	"os"
	"testing"

	"maps.vaz.io/share-gpx/store"
)

func TestFileStore_SaveAndRead(t *testing.T) {
	dir := t.TempDir()
	fs, err := store.NewFileStore(dir)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}

	data := []byte(`<gpx><trk></trk></gpx>`)
	if err := fs.Save("abc-123", data); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, err := fs.Read("abc-123")
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if string(got) != string(data) {
		t.Errorf("Read: got %q, want %q", got, data)
	}
}

func TestFileStore_ReadMissing(t *testing.T) {
	dir := t.TempDir()
	fs, err := store.NewFileStore(dir)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}

	_, err = fs.Read("nonexistent")
	if !os.IsNotExist(err) {
		t.Errorf("expected os.IsNotExist error, got %v", err)
	}
}
