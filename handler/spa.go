package handler

import (
	"io/fs"
	"net/http"
)

type SPAHandler struct {
	fsys fs.FS
}

func NewSPA(fsys fs.FS) *SPAHandler {
	return &SPAHandler{fsys: fsys}
}

func (h *SPAHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	http.ServeFileFS(w, r, h.fsys, "index.html")
}
