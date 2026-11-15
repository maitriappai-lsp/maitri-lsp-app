// Rolling debug log shared by the geofence task and the presence task.
// Lives in its own module so the two background tasks can both write to it
// without importing each other.
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEBUG_LOG_PREFIX = 'maitri-geofence-debug-log:';
const DEBUG_LOG_MAX_KEPT = 120;

// A release APK has no connected dev machine to watch console output on,
// so console.log/warn from a background task is otherwise invisible. This
// writes a rolling log to AsyncStorage instead, which the Attendance
// screen can read and display -- the only practical way to see what the
// background task actually did (or didn't do) on a real device.
//
// Each entry gets its OWN key (timestamp + random suffix) rather than
// being appended via read-modify-write to one shared key. Real-device
// testing showed the read-modify-write version silently losing entries
// when two geofence events fired close together and their logDebug calls
// overlapped -- one invocation's write clobbered the other's, instead of
// both landing. Independent keys can't collide this way.
export async function logDebug(msg) {
  try {
    const key = `${DEBUG_LOG_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem(key, JSON.stringify({ t: new Date().toISOString(), msg }));

    // Light pruning so storage doesn't grow unbounded over days of
    // testing -- keep only the most recent DEBUG_LOG_MAX_KEPT entries.
    const allKeys = await AsyncStorage.getAllKeys();
    const logKeys = allKeys.filter((k) => k.startsWith(DEBUG_LOG_PREFIX)).sort();
    if (logKeys.length > DEBUG_LOG_MAX_KEPT) {
      await AsyncStorage.multiRemove(logKeys.slice(0, logKeys.length - DEBUG_LOG_MAX_KEPT));
    }
  } catch (e) {
    // Logging itself failing isn't worth crashing over.
  }
}

export async function getDebugLog() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const logKeys = allKeys.filter((k) => k.startsWith(DEBUG_LOG_PREFIX)).sort();
    const pairs = await AsyncStorage.multiGet(logKeys);
    return pairs.map(([, v]) => JSON.parse(v));
  } catch (e) {
    return [];
  }
}

export async function clearDebugLog() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const logKeys = allKeys.filter((k) => k.startsWith(DEBUG_LOG_PREFIX));
    await AsyncStorage.multiRemove(logKeys);
  } catch (e) {
    // Fine to leave old entries if this fails -- not worth crashing over.
  }
}
