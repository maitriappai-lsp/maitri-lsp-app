// ---------------------------------------------------------------------------
// Presence monitor -- the reliable half of background auto time-out.
//
// Android geofence Exit events are batched and can be delayed for a long time
// (or never delivered) when the phone is idle. So while an attendance session
// is open, this task asks Android for a location fix every ~minute through a
// foreground service (the "location in use" notification). It compares each
// fix with the check-in geofence and, once the phone has been confidently
// outside for two consecutive fixes, marks time out itself. The geofence task
// in geofenceTask.js stays in place as a second, independent trigger.
//
// Like the geofence task this runs outside React, so it reads the session
// from AsyncStorage and talks to the backend with plain fetch().
// ---------------------------------------------------------------------------
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';
import { logDebug } from './debugLog';

export const PRESENCE_TASK = 'maitri-presence-task';
const SESSION_KEY = 'maitri-lsp-session-v1';
const STATE_KEY = 'maitri-presence-state-v1';

const POLL_INTERVAL_MS = 60 * 1000;      // how often Android is asked for a fix
const OUTSIDE_CONFIRM_MS = 55 * 1000;    // first->latest outside fix must span this (i.e. 2 consecutive fixes)
const MAX_USABLE_ACCURACY_M = 150;       // fixes worse than this are ignored
const MAX_SESSION_AGE_MS = 14 * 60 * 60 * 1000; // safety stop for a forgotten session

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function hhmm(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function ymd(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function readState() {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function writeState(state) {
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (e) {
    // not worth crashing over
  }
}

export async function stopPresenceMonitor() {
  try {
    await AsyncStorage.removeItem(STATE_KEY);
    if (await Location.hasStartedLocationUpdatesAsync(PRESENCE_TASK)) {
      await Location.stopLocationUpdatesAsync(PRESENCE_TASK);
      await logDebug('presence monitor stopped');
    }
  } catch (e) {
    await logDebug(`presence monitor stop failed: ${e?.message || e}`);
  }
}

// Starts (or keeps running) the monitor for one open attendance record.
// Idempotent: calling it again for the same record changes nothing. Must be
// called while the app is in the foreground (Android won't let a background
// task start a location foreground service).
export async function startPresenceMonitor({ recordId, geo }) {
  try {
    if (!recordId || !geo || geo.lat == null || geo.lng == null) {
      return { ok: false, reason: 'missing-record-or-geo' };
    }
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      await logDebug('presence monitor not started: background location permission not granted');
      return { ok: false, reason: 'background-permission' };
    }

    const running = await Location.hasStartedLocationUpdatesAsync(PRESENCE_TASK);
    const existing = await readState();
    if (running && existing?.recordId === recordId && existing?.geoId === geo.id) {
      return { ok: true, alreadyRunning: true };
    }
    if (running) await Location.stopLocationUpdatesAsync(PRESENCE_TASK);

    await writeState({
      recordId,
      geoId: geo.id,
      lat: geo.lat,
      lng: geo.lng,
      radius: geo.radiusMeters || 150,
      startedAt: Date.now(),
      outsideSince: null,
    });

    await Location.startLocationUpdatesAsync(PRESENCE_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: POLL_INTERVAL_MS,
      distanceInterval: 0, // time-based only, so a phone that stops outside the radius still reports
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Maitri LSP',
        notificationBody: 'Time out will be marked automatically when you leave the site.',
      },
    });
    await logDebug(`presence monitor started for ${recordId} at ${geo.id} (radius ${geo.radiusMeters || 150}m)`);
    return { ok: true };
  } catch (e) {
    await logDebug(`presence monitor start failed: ${e?.message || e}`);
    return { ok: false, reason: 'exception', message: e?.message || String(e) };
  }
}

async function finalizeTimeOut(state, leftAt) {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) {
    await logDebug('presence: no session in storage -- stopping monitor');
    await stopPresenceMonitor();
    return;
  }
  const { token } = JSON.parse(raw);
  const authHeaders = { Authorization: `Bearer ${token}` };

  const openRes = await fetch(`${API_BASE_URL}/api/attendance-open?date=${ymd(state.startedAt)}`, {
    headers: authHeaders,
  });
  if (!openRes.ok) {
    // Leave the state alone so the next fix retries.
    await logDebug(`presence: /api/attendance-open returned HTTP ${openRes.status} -- will retry`);
    return;
  }
  const { record } = await openRes.json();
  if (!record || record.id !== state.recordId) {
    await logDebug('presence: record already closed (or replaced) -- stopping monitor');
    await stopPresenceMonitor();
    return;
  }

  const timeOut = hhmm(leftAt);
  const patchRes = await fetch(`${API_BASE_URL}/api/attendance/${record.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ timeOut }),
  });
  if (!patchRes.ok) {
    await logDebug(`presence: PATCH failed HTTP ${patchRes.status} -- will retry`);
    return;
  }
  await logDebug(`presence: timed out at ${timeOut} (record ${record.id}, left the site at that time)`);
  await stopPresenceMonitor();
}

TaskManager.defineTask(PRESENCE_TASK, async ({ data, error }) => {
  if (error) {
    await logDebug(`presence task error: ${error.message}`);
    return;
  }
  const locations = data?.locations;
  if (!locations || locations.length === 0) return;

  try {
    const state = await readState();
    if (!state) {
      // Orphaned updates with nothing to monitor -- shut down.
      await stopPresenceMonitor();
      return;
    }
    if (Date.now() - state.startedAt > MAX_SESSION_AGE_MS) {
      await logDebug('presence: session older than 14h -- stopping monitor');
      await stopPresenceMonitor();
      return;
    }

    const loc = locations[locations.length - 1];
    const acc = loc.coords.accuracy || 0;
    const d = distanceMeters(loc.coords.latitude, loc.coords.longitude, state.lat, state.lng);

    if (acc > MAX_USABLE_ACCURACY_M) {
      await logDebug(`presence: ignoring fix with poor accuracy (${Math.round(acc)}m)`);
      return;
    }

    const confidentlyOutside = d - acc > state.radius;
    if (!confidentlyOutside) {
      if (state.outsideSince) {
        state.outsideSince = null;
        await writeState(state);
        await logDebug(`presence: back inside (${Math.round(d)}m from centre, radius ${state.radius}m)`);
      }
      return;
    }

    if (!state.outsideSince) {
      state.outsideSince = loc.timestamp;
      await writeState(state);
      await logDebug(`presence: outside (${Math.round(d)}m from centre, radius ${state.radius}m, accuracy ${Math.round(acc)}m) -- confirming`);
      return;
    }
    if (loc.timestamp - state.outsideSince < OUTSIDE_CONFIRM_MS) return;

    await logDebug(`presence: outside confirmed (${Math.round(d)}m from centre) -- timing out`);
    await finalizeTimeOut(state, state.outsideSince);
  } catch (e) {
    await logDebug(`presence task threw: ${e?.message || e}`);
  }
});
