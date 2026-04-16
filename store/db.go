package store

import (
	"database/sql"
	"errors"
	"time"

	_ "modernc.org/sqlite"
)

type Trail struct {
	UUID       string
	Filename   string
	UploadedAt time.Time
	SizeBytes  int64
}

type DB struct {
	db *sql.DB
}

func NewDB(path string) (*DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS trails (
		uuid        TEXT PRIMARY KEY,
		filename    TEXT NOT NULL,
		uploaded_at DATETIME NOT NULL,
		size_bytes  INTEGER NOT NULL
	)`); err != nil {
		db.Close()
		return nil, err
	}
	return &DB{db: db}, nil
}

func (d *DB) Insert(t Trail) error {
	_, err := d.db.Exec(
		`INSERT INTO trails (uuid, filename, uploaded_at, size_bytes) VALUES (?, ?, ?, ?)`,
		t.UUID, t.Filename, t.UploadedAt, t.SizeBytes,
	)
	return err
}

func (d *DB) Get(uuid string) (*Trail, error) {
	var t Trail
	err := d.db.QueryRow(
		`SELECT uuid, filename, uploaded_at, size_bytes FROM trails WHERE uuid = ?`, uuid,
	).Scan(&t.UUID, &t.Filename, &t.UploadedAt, &t.SizeBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (d *DB) Close() error {
	return d.db.Close()
}
