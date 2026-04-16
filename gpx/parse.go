package gpx

import (
	"encoding/xml"
	"fmt"
	"math"
	"time"
)

type GeoJSONFeature struct {
	Type     string          `json:"type"`
	Geometry GeoJSONGeometry `json:"geometry"`
}

type GeoJSONGeometry struct {
	Type        string       `json:"type"`
	Coordinates [][2]float64 `json:"coordinates"`
}

type ElevationPoint struct {
	DistKm float64 `json:"dist_km"`
	EleM   float64 `json:"ele_m"`
}

type ParseResult struct {
	GeoJSON          GeoJSONFeature
	DistanceKm       float64
	ElevationGainM   float64
	DurationMin      *float64
	ElevationProfile []ElevationPoint
}

type xmlGPX struct {
	Tracks []xmlTrack `xml:"trk"`
}

type xmlTrack struct {
	Segments []xmlSegment `xml:"trkseg"`
}

type xmlSegment struct {
	Points []xmlPoint `xml:"trkpt"`
}

type xmlPoint struct {
	Lat  float64 `xml:"lat,attr"`
	Lon  float64 `xml:"lon,attr"`
	Ele  float64 `xml:"ele"`
	Time string  `xml:"time"`
}

type point struct {
	lat, lon, ele float64
	t             *time.Time
}

func Parse(data []byte) (*ParseResult, error) {
	var g xmlGPX
	if err := xml.Unmarshal(data, &g); err != nil {
		return nil, err
	}

	var pts []point
	for _, trk := range g.Tracks {
		for _, seg := range trk.Segments {
			for _, xp := range seg.Points {
				p := point{lat: xp.Lat, lon: xp.Lon, ele: xp.Ele}
				if xp.Time != "" {
					t, err := time.Parse(time.RFC3339, xp.Time)
					if err == nil {
						p.t = &t
					}
				}
				pts = append(pts, p)
			}
		}
	}

	if len(pts) == 0 {
		return nil, fmt.Errorf("GPX file contains no track points")
	}

	return &ParseResult{
		GeoJSON:          buildGeoJSON(pts),
		DistanceKm:       totalDistance(pts),
		ElevationGainM:   elevationGain(pts),
		DurationMin:      calcDuration(pts),
		ElevationProfile: buildProfile(pts),
	}, nil
}

func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func totalDistance(pts []point) float64 {
	var d float64
	for i := 1; i < len(pts); i++ {
		d += haversine(pts[i-1].lat, pts[i-1].lon, pts[i].lat, pts[i].lon)
	}
	return math.Round(d*100) / 100
}

func elevationGain(pts []point) float64 {
	var gain float64
	for i := 1; i < len(pts); i++ {
		if pts[i].ele > pts[i-1].ele {
			gain += pts[i].ele - pts[i-1].ele
		}
	}
	return math.Round(gain)
}

func calcDuration(pts []point) *float64 {
	if len(pts) < 2 || pts[0].t == nil || pts[len(pts)-1].t == nil {
		return nil
	}
	d := pts[len(pts)-1].t.Sub(*pts[0].t).Minutes()
	return &d
}

func buildGeoJSON(pts []point) GeoJSONFeature {
	coords := make([][2]float64, len(pts))
	for i, p := range pts {
		coords[i] = [2]float64{p.lon, p.lat}
	}
	return GeoJSONFeature{
		Type: "Feature",
		Geometry: GeoJSONGeometry{Type: "LineString", Coordinates: coords},
	}
}

func buildProfile(pts []point) []ElevationPoint {
	profile := make([]ElevationPoint, len(pts))
	var cumDist float64
	for i, p := range pts {
		if i > 0 {
			cumDist += haversine(pts[i-1].lat, pts[i-1].lon, p.lat, p.lon)
		}
		profile[i] = ElevationPoint{
			DistKm: math.Round(cumDist*1000) / 1000,
			EleM:   p.ele,
		}
	}
	return profile
}
