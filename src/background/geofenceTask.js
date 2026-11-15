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
// - A background task has no guaranteed execution budget. An earlier
//   version of this file waited ~25s before finalizing (mirroring the
//   foreground watcher's grace period) -- real-device testing showed the
//   OS can suspend the task mid-wait before it ever gets there, so there
//   is now NO artificial delay here at all; it acts immediately on a
//   confirmed exit and leans on Android's own geofencing dwell/confidence
//   logic as the only debounce.
// - Geofencing delivers discrete Enter/Exit transitions, not a continuous
//   stream of positions -- there is no background equivalent of "poll every
//   15 seconds" the way the foreground watcher works.
// ---------------------------------------------------------------------------
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';
import { logDebug, getDebugLog, clearDebugLog } from './debugLog';
import { stopPresenceMonitor } from './presenceTask';

// AttendanceScreen imports these from here.
export { getDebugLog, clearDebugLog };
import { isFacilitatorRole } from '../utils/roles';

export const GEOFENCE_TASK = 'maitri-geofence-task';
const SESSION_KEY = 'maitri-lsp-session-v1';
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

// Great-circle distance between two lat/lng points, in metres.
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Android (and iOS) can deliver an Exit event that doesn't reflect a real
// departure -- e.g. a poor/coarse location fix once the app is no longer in
// the foreground. So before timing anyone out, take one fresh reading and
// only proceed if the phone really is outside the region. If a reading
// can't be obtained within a few seconds, fall back to trusting the Exit
// event (the previous behaviour), so a real exit is never silently missed.
async function confirmOutsideRegion(region) {
  if (region?.latitude == null || region?.longitude == null || !region?.radius) {
    return { known: false, reason: 'region has no coordinates/radius' };
  }
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('position timeout')), 10000)),
    ]);
    const d = distanceMeters(pos.coords.latitude, pos.coords.longitude, region.latitude, region.longitude);
    return { known: true, inside: d <= region.radius, distance: Math.round(d), accuracy: Math.round(pos.coords.accuracy || 0) };
  } catch (e) {
    return { known: false, reason: e?.message || String(e) };
  }
}

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    await logDebug(`task error: ${error.message}`);
    return;
  }
  const { eventType, region } = data || {};
  await logDebug(
    `task invoked: eventType=${eventType === Location.GeofencingEventType.Exit ? 'Exit' : eventType === Location.GeofencingEventType.Enter ? 'Enter' : eventType} region=${region?.identifier}`
  );
 if (eventType === Location.GeofencingEventType.Enter) {
  await logDebug(
    `entered geofence: ${region?.identifier}`
  );
  return;
}

if (eventType !== Location.GeofencingEventType.Exit) return;

  // Stamp the exit time the moment the event arrives. If the OS freezes this
  // task mid-network-call and resumes it later (e.g. when the app wakes up
  // again), the recorded time-out is still when the facilitator actually left.
  const exitedAt = nowHHMM();

  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) {
      await logDebug('skipped: no session in storage');
      return;
    }
    const { token, user } = JSON.parse(raw);
    if (!token || !user || !isFacilitatorRole(user.role)) {
      await logDebug(`skipped: session present but not a facilitator (role=${user?.role})`);
      return;
    }

    // An administrator can disable GPS attendance while this task remains
    // registered with the operating system, so the shared setting is still
    // checked -- but IN PARALLEL with the open-record lookup, not before it.
    // Two sequential requests made the task much easier for the OS to freeze
    // mid-flight (especially when the backend is cold-starting), which showed
    // up as a time-out that only completed once the phone came back into the
    // radius. A slow/failed settings read no longer blocks the time-out; only
    // an explicit gpsOnBeneficiary === false skips it.
    const date = todayLocalYMD();
    const authHeaders = { Authorization: `Bearer ${token}` };
    const [settings, openRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/system-parameters`, { headers: authHeaders })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${API_BASE_URL}/api/attendance-open?date=${date}`, { headers: authHeaders }),
    ]);
    if (settings === null) {
      await logDebug('could not read system parameters -- continuing with time-out');
    } else if (settings.gpsOnBeneficiary === false) {
      await logDebug('skipped: GPS attendance verification is disabled');
      return;
    }
    if (!openRes.ok) {
      await logDebug(`skipped: /api/attendance-open returned HTTP ${openRes.status}`);
      return;
    }
    const { record } = await openRes.json();
    if (!record) {
      await logDebug('skipped: no open attendance record for today');
      return;
    }
    if (record.checkedInGeoId && region.identifier !== record.checkedInGeoId) {
      await logDebug(
        `skipped: exit was from ${region.identifier}, but this check-in belongs to ${record.checkedInGeoId} -- unrelated geofence`
      );
      return;
    }
    const check = await confirmOutsideRegion(region);
    if (check.known && check.inside) {
      await logDebug(
        `skipped: Exit event received, but a fresh reading puts the phone ${check.distance}m from the centre (radius ${region.radius}m, accuracy ${check.accuracy}m) -- still inside, not timing out`
      );
      return;
    }
    await logDebug(
      check.known
        ? `Exit confirmed: ${check.distance}m from centre (radius ${region.radius}m, accuracy ${check.accuracy}m)`
        : `could not confirm position (${check.reason}) -- trusting the Exit event`
    );
    await logDebug(`open record found (id=${record.id}) -- finalizing time out now`);

    // No sleep/re-check here on purpose: real-device testing showed a
    // background task can be suspended by the OS mid-wait, before it ever
    // reaches the network calls, if asked to sit through an artificial
    // delay first. Android's geofencing already has its own internal
    // dwell/confidence thresholds before it fires an Exit at all (part of
    // why it can take a while to trigger), so leaning on that instead of
    // adding a second layer of debounce here trades a little jitter
    // protection for the task actually completing.
    const timeOut = exitedAt;
    const patchRes = await fetch(`${API_BASE_URL}/api/attendance/${record.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ timeOut }),
    });
    await logDebug(
      patchRes.ok
        ? `timed out successfully at ${timeOut} (record ${record.id})`
        : `PATCH failed: HTTP ${patchRes.status}`
    );
    if (patchRes.ok) await stopPresenceMonitor();
  } catch (e) {
    await logDebug(`task threw: ${e?.message || e}`);
  }
});

// Requests background location (on top of foreground, which must already
// be granted) and registers every geofence as a monitored region. Called
// once a Facilitator is signed in and db.geo has loaded (see
// AttendanceScreen.js). Returns { ok: false, reason } rather than throwing,
// so the caller can fall back to the foreground-only watcher when
// background permission isn't available.
export async function registerGeofences(geoList) {
  try {
    // Actively request (not just check) -- this runs in parallel with the
    // Attendance screen's own location check-in, which is what actually
    // triggers the OS permission dialog. A passive check here could run
    // and fail before that dialog is even answered; requesting instead
    // waits for the real outcome (and is a no-op if already granted).
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      await logDebug('registerGeofences: foreground permission not granted');
      return { ok: false, reason: 'foreground-permission' };
    }

    // On Android 11+ this can prompt the user to go into Settings and
    // choose "Allow all the time" -- it will NOT be grantable from a
    // single in-app dialog the way foreground permission is. First-time
    // callers should expect this to often come back denied until the user
    // does that manually, which is why this fails soft rather than
    // erroring.
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      await logDebug(`registerGeofences: background permission not granted (status=${bg.status})`);
      return { ok: false, reason: 'background-permission' };
    }

    if (!geoList || geoList.length === 0) {
      await logDebug('registerGeofences: no geofences to register');
      return { ok: false, reason: 'no-geofences' };
    }

    // iOS caps monitored regions at 20. There's no dynamic "nearest 20"
    // swapping implemented here -- if there are ever more than 20
    // geofences, whichever are past the 20th in this list simply won't be
    // monitored in the background (the foreground watcher, where active,
    // has no such limit).
    const regions = geoList.slice(0, 20).map((g) => ({
  identifier: g.id,
  latitude: g.lat,
  longitude: g.lng,
  radius: g.radiusMeters || 150,
  notifyOnEnter: true,
  notifyOnExit: true,
}));

    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
    await logDebug(`registerGeofences: registered ${regions.length} region(s) successfully`);
    // Log exactly what was registered -- lets you cross-check against the
    // real-world location (e.g. in Google Maps) that the radius genuinely
    // covers where you stood, and catches any stale/wrong coordinates.
    for (const r of regions) {
      await logDebug(`  region ${r.identifier}: lat=${r.latitude}, lng=${r.longitude}, radius=${r.radius}m`);
    }
    const stillRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
    await logDebug(`post-registration check: task registered with OS = ${stillRegistered}`);
    return { ok: true, count: regions.length, truncated: geoList.length > 20 };
  } catch (e) {
    await logDebug(`registerGeofences threw: ${e?.message || e}`);
    return { ok: false, reason: 'exception', message: e?.message || String(e) };
  }
}

// On-demand check, independent of registerGeofences -- some phones' OEM
// battery management has been known to silently drop a registered
// background task over time without the app being told. Calling this
// right after a real-world test (rather than only at registration time)
// shows whether the registration actually survived the whole wait.
export async function isGeofencingTaskRegistered() {
  const registered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  await logDebug(`on-demand check: task registered with OS = ${registered}`);
  return registered;
}

export async function unregisterGeofences() {
  const started = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK);
}
