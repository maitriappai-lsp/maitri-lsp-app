// ---------------------------------------------------------------------------
// Background auto time-out.
//
// This task is defined at module load time (imported once, at the very top
// of App.js) so it's registered before any geofence event can be delivered
// -- including when Android/iOS launches the app headlessly just to run
// this task, with no screen ever opened.
//
// It runs OUTSIDE the React tree: no AuthContext, no useData(), no `db`
// state. It has to be fully self-sufficient -- reading the session straight
// from AsyncStorage, and talking to the backend with plain fetch() calls
// (see api.js's equivalents, duplicated here deliberately rather than
// imported, since api.js's module-level `authToken` variable belongs to
// the foreground app instance and won't be populated in a headless launch).
//
// IMPORTANT CAVEATS (read before assuming this "just works"):
// - This requires the "Allow all the time" background location permission,
//   a separate, more sensitive grant than the foreground one, and Android
//   11+ routes that through the OS Settings app rather than an in-app
//   dialog. See registerGeofences() below for the request flow.
// - OS battery optimizers (notably on Xiaomi/MIUI, Samsung, OnePlus) can
//   still kill background tasks regardless of granted permissions. This is
//   a real-device, OEM-dependent risk that no amount of correct code
//   eliminates outright -- testing on the actual phones your team uses is
//   the only way to know it holds up.
// - A background task has no guaranteed execution budget. The grace period
//   below (BACKGROUND_EXIT_GRACE_MS) is intentionally much shorter than the
//   foreground watcher's 90s for exactly this reason: a long artificial
//   delay risks the OS suspending the task before it finishes.
// - Geofencing delivers discrete Enter/Exit transitions, not a continuous
//   stream of positions -- there is no background equivalent of "poll every
//   15 seconds" the way the foreground watcher works.
// ---------------------------------------------------------------------------
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';

export const GEOFENCE_TASK = 'maitri-geofence-task';
const SESSION_KEY = 'maitri-lsp-session-v1';
const BACKGROUND_EXIT_GRACE_MS = 25 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayLocalYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Geofence task error', error.message);
    return;
  }
  const { eventType, region } = data;
  if (eventType !== Location.GeofencingEventType.Exit) return; // entries don't auto time-in; only exits matter here

  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const { token, user } = JSON.parse(raw);
    if (!token || !user || user.role !== 'Facilitator') return;

    const date = todayLocalYMD();
    const openRes = await fetch(`${API_BASE_URL}/api/attendance-open?date=${date}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!openRes.ok) return;
    const { record } = await openRes.json();
    if (!record) return; // nothing open -- this exit doesn't matter

    // Short grace period (see file header for why this is much shorter
    // than the foreground version), then re-check: did the exit hold, or
    // was it a momentary GPS blip?
    await sleep(BACKGROUND_EXIT_GRACE_MS);
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
    if (pos && typeof region.latitude === 'number' && typeof region.longitude === 'number') {
      const distance = distanceMeters(pos.coords.latitude, pos.coords.longitude, region.latitude, region.longitude);
      if (distance <= (region.radius || 0)) return; // back inside already -- don't time out
    }

    await fetch(`${API_BASE_URL}/api/attendance/${record.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ timeOut: nowHHMM() }),
    });
  } catch (e) {
    console.warn('Geofence task failed', e?.message || e);
  }
});

// Requests background location (on top of foreground, which must already
// be granted) and registers every geofence as a monitored region. Called
// once a Facilitator is signed in and db.geo has loaded (see
// AttendanceScreen.js). Returns { ok: false, reason } rather than throwing,
// so the caller can fall back to the foreground-only watcher when
// background permission isn't available.
export async function registerGeofences(geoList) {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, reason: 'foreground-permission' };

  // On Android 11+ this can prompt the user to go into Settings and choose
  // "Allow all the time" -- it will NOT be grantable from a single in-app
  // dialog the way foreground permission is. First-time callers should
  // expect this to often come back denied until the user does that
  // manually, which is why this fails soft rather than erroring.
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return { ok: false, reason: 'background-permission' };

  if (!geoList || geoList.length === 0) return { ok: false, reason: 'no-geofences' };

  // iOS caps monitored regions at 20. There's no dynamic "nearest 20"
  // swapping implemented here -- if there are ever more than 20 geofences,
  // whichever are past the 20th in this list simply won't be monitored in
  // the background (the foreground watcher, where active, has no such
  // limit).
  const regions = geoList.slice(0, 20).map((g) => ({
    identifier: g.id,
    latitude: g.lat,
    longitude: g.lng,
    radius: g.radiusMeters || 150,
    notifyOnEnter: false,
    notifyOnExit: true,
  }));

  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
  return { ok: true, count: regions.length, truncated: geoList.length > 20 };
}

export async function unregisterGeofences() {
  const started = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK);
}
