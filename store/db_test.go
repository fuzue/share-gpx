package store_test

import (
	"testing"
	"time"

	"maps.vaz.io/share-gpx/store"
)

func TestDB_InsertAndGet(t *testing.T) {
	db, err := store.NewDB(":memory:")
	if err != nil {
		t.Fatalf("NewDB: %v", err)
	}
	defer db.Close()

	trail := store.Trail{
		UUID:       "test-uuid-1234",
		Filename:   "hike.gpx",
		UploadedAt: time.Now().UTC().Truncate(time.Second),
		SizeBytes:  1024,
	}

	if err := db.Insert(trail); err != nil {
		t.Fatalf("Insert: %v", err)
	}

	got, err := db.Get("test-uuid-1234")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got == nil {
		t.Fatal("expected trail, got nil")
	}
	if got.UUID != trail.UUID {
		t.Errorf("UUID: got %q, want %q", got.UUID, trail.UUID)
	}
	if got.Filename != trail.Filename {
		t.Errorf("Filename: got %q, want %q", got.Filename, trail.Filename)
	}
	if got.SizeBytes != trail.SizeBytes {
		t.Errorf("SizeBytes: got %d, want %d", got.SizeBytes, trail.SizeBytes)
	}
	if !got.UploadedAt.Equal(trail.UploadedAt) {
		t.Errorf("UploadedAt: got %v, want %v", got.UploadedAt, trail.UploadedAt)
	}
}

func TestDB_GetMissing(t *testing.T) {
	db, err := store.NewDB(":memory:")
	if err != nil {
		t.Fatalf("NewDB: %v", err)
	}
	defer db.Close()

	got, err := db.Get("nonexistent")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil for missing UUID, got %+v", got)
	}
}
