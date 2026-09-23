// Haversine distance in metres between two lat/lng points.
// This is real, working geofence math -- no native geofencing plugin needed
// for a "am I inside the radius right now" check. If you later want
// background/trigger-based fencing (per the spec's "native geofencing APIs"
// suggestion), swap this for expo-task-manager + expo-location geofencing.
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Returns the first geo record the given coords fall inside, or null.
export function findGeofenceMatch(geoList, lat, lng) {
  for (const g of geoList) {
    const d = distanceMeters(lat, lng, g.lat, g.lng);
    if (d <= g.radiusMeters) return { ...g, distance: d };
  }
  return null;
}
