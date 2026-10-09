// SCREEN 2 (Facilitator): Attendance.
//
// Location-first flow: a facilitator can legitimately show up at any
// beneficiary's location, not just the one scheduled for them that day (a
// substitute covering someone else's session, an extra visit, etc). So the
// geofence check doesn't require picking a beneficiary first -- it checks
// the phone's GPS against every geofence in the system, works out which
// beneficiary(ies) that geofence belongs to, and asks the facilitator to
// confirm/pick among those if more than one class shares the same block.
// If the resolved beneficiary wasn't on today's schedule for this
// facilitator, that's flagged as an ad-hoc visit rather than blocked.
//
// The location check runs automatically as soon as this screen opens (no
// manual button tap needed) -- a re-check button is still there in case the
// first attempt fails and they want to retry after moving. Time In stays
// disabled until the check passes and the face check passes.
//
// AUTOMATIC time out: once timed in, a continuous foreground location watch
// (expo-location's watchPositionAsync) checks whether the facilitator is
// still inside the geofence they checked into. If they've been continuously
// outside it for EXIT_GRACE_MS, time out fires on its own. The grace period
// exists because raw GPS readings jitter near a boundary -- without it, one
// noisy reading near the edge could time someone out incorrectly. A manual
// "Mark time out" button stays available too.
//
// IMPORTANT LIMITATION: this only runs while the app is open and the screen
// is active (foreground). If the phone is locked or the app is
// backgrounded, location updates stop and auto time-out won't fire until
// the app is reopened -- at which point it re-evaluates immediately. True
// background geofencing (works with the phone locked/in a pocket) needs
// expo-location's startGeofencingAsync + a TaskManager background task,
// extra OS permissions, and a custom EAS build -- a bigger, separate piece
// of work from this foreground version.
//
// Only one open (not-timed-out) attendance session is allowed per
// facilitator per day: if they already have one, this screen loads it back
// up on open rather than letting a second time-in start.
//
// Marking Time In creates a real attendance record (geoVerified: true,
// adHoc: true if it wasn't scheduled) so it shows up in both dashboards'
// Attendance tab. Marking (or auto-marking) Time Out updates that same
// record. The session-quality side (category, rating, feedback, headcount)
// is filled in afterward on the Sessions screen, which lists today's
// checked-in records to finish -- and refuses to let a session be logged at
// all for a day with no attendance record, so PSR can't exist without a
// real check-in behind it.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { findGeofenceMatch } from '../../utils/geofence';
import { registerGeofences, getDebugLog, clearDebugLog, isGeofencingTaskRegistered } from '../../background/geofenceTask';
import { Screen, Card, SectionLabel, Select, PrimaryButton, SecondaryButton } from '../../components/UI';
import { colors, spacing } from '../../theme';
import { todayLocalYMD, nowHHMM } from '../../utils/date';

// How long the facilitator must be continuously outside the checked-in
// geofence before auto time-out fires.
const EXIT_GRACE_MS = 90 * 1000;

export default function AttendanceScreen() {
  const { currentUser } = useAuth();
  const { db, getBeneficiary, addRecord, updateRecord, nextId } = useData();
  const today = todayLocalYMD();

  const todaysSchedule = useMemo(
    // Sessions where I'm the main facilitator OR the assistant -- either way
    // it's a scheduled visit for me, not an ad-hoc one.
    () =>
      db.schedule.filter(
        (s) => (s.facilitatorId === currentUser?.id || s.assistantId === currentUser?.id) && s.date === today
      ),
    [db.schedule, currentUser?.id, today]
  );

  const [checking, setChecking] = useState(false);
  const [geoMatch, setGeoMatch] = useState(null); // the matched geo record + distance, or null
  const [checkFailed, setCheckFailed] = useState(false);
  const [candidateBeneficiaries, setCandidateBeneficiaries] = useState([]);
  const [beneficiaryId, setBeneficiaryId] = useState(null);
  const [faceVerified, setFaceVerified] = useState(false);
  const [attendanceRecordId, setAttendanceRecordId] = useState(null);
  const [checkedInGeoId, setCheckedInGeoId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [timeIn, setTimeIn] = useState(null);
  const [timeOut, setTimeOut] = useState(null);
  const [resumedOpenSession, setResumedOpenSession] = useState(false);
  const [autoWatching, setAutoWatching] = useState(false);
  const [autoWatchMode, setAutoWatchMode] = useState(null); // 'background' | 'foreground' | null
  const [autoWatchFailReason, setAutoWatchFailReason] = useState(null);
  const [debugLog, setDebugLog] = useState([]);
  const [showDebugLog, setShowDebugLog] = useState(false);

  async function refreshDebugLog() {
    setDebugLog(await getDebugLog());
  }

  const beneficiary = beneficiaryId ? getBeneficiary(beneficiaryId) : null;
  const isScheduled = beneficiary
    ? todaysSchedule.some((s) => s.beneficiaryId === beneficiary.id)
    : false;

  const stateRef = useRef({});
  useEffect(() => {
    stateRef.current = { timeIn, timeOut, checkedInGeoId, saving, attendanceRecordId, geo: db.geo };
  }, [timeIn, timeOut, checkedInGeoId, saving, attendanceRecordId, db.geo]);

  // Follow the saved record: if the background task (or another device)
  // timed this session out while the app was away, pick that up as soon as
  // the data refreshes, so the screen switches to "attendance complete"
  // instead of still offering "Mark time out".
  useEffect(() => {
    if (!attendanceRecordId) return;
    const rec = db.attendance.find((a) => a.id === attendanceRecordId);
    if (rec?.timeOut && rec.timeOut !== timeOut) setTimeOut(rec.timeOut);
  }, [db.attendance, attendanceRecordId]);

  const outsideSinceRef = useRef(null);
  const autoActionInFlightRef = useRef(false);
  const watchSubRef = useRef(null);

  // On open: if there's already an open (not timed-out) session for today,
  // resume it instead of allowing a second time-in. Otherwise, run the
  // location check automatically.
  useEffect(() => {
    if (!currentUser) return;
    const open = db.attendance.find(
      (a) => a.facilitatorId === currentUser.id && a.date === today && !a.timeOut
    );
    if (open) {
      setResumedOpenSession(true);
      setAttendanceRecordId(open.id);
      setBeneficiaryId(open.beneficiaryId);
      setTimeIn(open.timeIn);
      const openBeneficiary = getBeneficiary(open.beneficiaryId);
      setCheckedInGeoId(openBeneficiary?.geoId || null);
    } else {
      checkLocation();
    }

    // Start the foreground watcher right away as the working baseline --
    // it doesn't need db.geo to have loaded yet in the same sense
    // (findGeofenceMatch just sees an empty list until it has), and it
    // gives auto time-out a chance to work immediately rather than
    // waiting on background registration (see the separate effect below)
    // to finish first. This is also deliberately NOT racing against
    // checkLocation()'s own permission request above -- it requests
    // foreground permission itself, but two concurrent requests for the
    // *same* permission are a much safer race than foreground vs.
    // background permission prompts were.
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      watchSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 10 },
        (pos) => {
          const s = stateRef.current;
          if (!s.timeIn || s.timeOut) return; // only watching for exit while a session is open
          const match = findGeofenceMatch(s.geo || [], pos.coords.latitude, pos.coords.longitude);
          const stillInside = !!match && match.id === s.checkedInGeoId;
          if (stillInside) {
            outsideSinceRef.current = null;
            return;
          }
          if (!outsideSinceRef.current) outsideSinceRef.current = Date.now();
          const outsideMs = Date.now() - outsideSinceRef.current;
          if (outsideMs >= EXIT_GRACE_MS && !s.saving && !autoActionInFlightRef.current) {
            autoActionInFlightRef.current = true;
            markTimeOut({ auto: true }).finally(() => {
              autoActionInFlightRef.current = false;
            });
          }
        }
      );
      if (!cancelled) {
        setAutoWatchMode((mode) => mode || 'foreground'); // don't downgrade if background already won
        setAutoWatching(true);
      }
    })();

    return () => {
      cancelled = true;
      if (watchSubRef.current) {
        watchSubRef.current.remove();
        watchSubRef.current = null;
      }
    };
    // Only on first mount -- re-checks after that are the explicit button,
    // and the watch subscription reads current state via stateRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // Background geofence registration runs as its own effect, separate
  // from the mount effect above, specifically so it isn't attempted before
  // db.geo has actually loaded from the server (it starts out empty right
  // after login) -- registering with an empty list used to fail
  // permanently with "no-geofences" the moment this ran too early, with no
  // retry once the real data arrived. Re-runs if db.geo's length changes
  // (e.g. it loads a moment after mount) and stops once it has already
  // succeeded once (tracked via autoWatchMode, not re-registered on every
  // background poll/refresh).
  useEffect(() => {
    if (!currentUser || autoWatchMode === 'background') return;
    if (!db.geo || db.geo.length === 0) return;

    let cancelled = false;
    (async () => {
      // A short delay before requesting background permission, on top of
      // waiting for db.geo to load, to further avoid racing the
      // foreground permission dialog that checkLocation() and the
      // foreground-watcher effect above may still be resolving right
      // after this screen opens.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (cancelled) return;

      const bgResult = await registerGeofences(db.geo);
      if (cancelled) return;
      if (bgResult.ok) {
        setAutoWatchMode('background');
        setAutoWatchFailReason(null);
        setAutoWatching(true);
        // Background now covers exit detection -- the foreground watcher
        // running alongside it would just be redundant.
        if (watchSubRef.current) {
          watchSubRef.current.remove();
          watchSubRef.current = null;
        }
      } else {
        setAutoWatchFailReason(bgResult.reason + (bgResult.message ? `: ${bgResult.message}` : ''));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, db.geo.length, autoWatchMode]);

  function resetSession() {
    setGeoMatch(null);
    setCheckFailed(false);
    setCandidateBeneficiaries([]);
    setBeneficiaryId(null);
    setFaceVerified(false);
    setAttendanceRecordId(null);
    setCheckedInGeoId(null);
    setTimeIn(null);
    setTimeOut(null);
    setResumedOpenSession(false);
    outsideSinceRef.current = null;
  }

  async function checkLocation() {
    resetSession();
    setChecking(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission needed', 'Enable location to check you are at a registered site.');
        setCheckFailed(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const match = findGeofenceMatch(db.geo, pos.coords.latitude, pos.coords.longitude);
      if (!match) {
        setCheckFailed(true);
        return;
      }
      setGeoMatch(match);
      const candidates = db.beneficiaries.filter((b) => b.geoId === match.id);
      setCandidateBeneficiaries(candidates);
      if (candidates.length === 1) {
        setBeneficiaryId(candidates[0].id);
      } else if (candidates.length === 0) {
        Alert.alert(
          'Geofence not linked',
          `You're at ${match.school}${match.label ? ' - ' + match.label : ''}, but no beneficiary is linked to this geofence yet. Ask your Admin to link one on the Beneficiaries tab.`
        );
      }
    } catch (e) {
      Alert.alert('Could not get location', String(e.message || e));
      setCheckFailed(true);
    } finally {
      setChecking(false);
    }
  }

  function verifyFace() {
    // Stub: in production, open the camera, run the on-device model, and
    // compare against currentUser's stored facial embedding.
    setFaceVerified(true);
  }

  const canMarkTime = !!geoMatch && !!beneficiary && faceVerified;

  async function markTimeIn() {
    // Safety net against a stale-state double time-in, on top of the
    // resume-on-open check above.
    const alreadyOpen = db.attendance.find(
      (a) => a.facilitatorId === currentUser.id && a.date === today && !a.timeOut
    );
    if (alreadyOpen) {
      Alert.alert('Already timed in', 'You have an open session today -- time out of it before starting another.');
      return;
    }
    setSaving(true);
    try {
      const id = nextId('ATT', 'attendance');
      const record = {
        id,
        beneficiaryId: beneficiary.id,
        facilitatorId: currentUser.id,
        date: today,
        timeIn: nowHHMM(),
        timeOut: '',
        geoVerified: true,
        adHoc: !isScheduled,
      };
      const saved = await addRecord('attendance', record);
      setAttendanceRecordId(saved.id);
      setTimeIn(record.timeIn);
      setCheckedInGeoId(geoMatch.id);
      outsideSinceRef.current = null;
    } catch (e) {
      Alert.alert('Could not save time in', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function markTimeOut({ auto = false } = {}) {
    // Called from the location watcher too, which was set up on first mount,
    // so read the record id from the ref rather than this render's state.
    const recordId = stateRef.current.attendanceRecordId || attendanceRecordId;
    if (!recordId) return;
    // Already timed out (e.g. by the background task)? Don't overwrite it.
    const existing = db.attendance.find((a) => a.id === recordId);
    if (existing?.timeOut) {
      setTimeOut(existing.timeOut);
      return;
    }
    setSaving(true);
    try {
      const value = nowHHMM();
      await updateRecord('attendance', recordId, { timeOut: value });
      setTimeOut(value);
      if (auto) {
        Alert.alert('Timed out automatically', `You moved out of the geofence, so time out was marked at ${value}.`);
      }
    } catch (e) {
      Alert.alert('Could not save time out', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 2 }}>
          {currentUser?.name}
        </Text>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.lg }}>
          Today -- {new Date().toDateString()}
        </Text>

        {autoWatching && timeIn && !timeOut && (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: spacing.sm }}>
            {autoWatchMode === 'background'
              ? 'Watching your location -- time out will be marked automatically if you leave the site, even with the app closed or your phone locked.'
              : 'Watching your location -- time out will be marked automatically if you leave the site. Keep the app open for this to work.'}
          </Text>
        )}
        {autoWatchFailReason && (
          <Text style={{ color: colors.amber, fontSize: 11, marginBottom: spacing.sm }}>
            Background auto time-out isn't active ({autoWatchFailReason}) -- using foreground-only watching instead.
          </Text>
        )}

        <TouchableOpacity
          onPress={() => {
            const next = !showDebugLog;
            setShowDebugLog(next);
            if (next) refreshDebugLog();
          }}
          style={{ marginBottom: spacing.md }}
        >
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>
            {showDebugLog ? '\u25be' : '\u25b8'} Background activity log (debug)
          </Text>
        </TouchableOpacity>
        {showDebugLog && (
          <Card style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <TouchableOpacity
                onPress={async () => {
                  await isGeofencingTaskRegistered();
                  refreshDebugLog();
                }}
              >
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Check registration now</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={refreshDebugLog}>
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Refresh</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  await clearDebugLog();
                  refreshDebugLog();
                }}
              >
                <Text style={{ color: colors.red, fontSize: 12, fontWeight: '700' }}>Clear</Text>
              </TouchableOpacity>
            </View>
            {debugLog.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                No background activity recorded yet. This fills in as the background task actually runs --
                entering/leaving a geofence with background permission granted.
              </Text>
            ) : (
              debugLog
                .slice()
                .reverse()
                .map((entry, i) => (
                  <Text key={i} style={{ color: colors.text, fontSize: 11, marginBottom: 4 }}>
                    {new Date(entry.t).toLocaleTimeString()} -- {entry.msg}
                  </Text>
                ))
            )}
          </Card>
        )}

        {resumedOpenSession && (
          <Card>
            <SectionLabel>Open session from earlier today</SectionLabel>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {beneficiary?.school} {beneficiary?.class} {beneficiary?.section} -- timed in at {timeIn}. Mark time
              out below when the session ends, or leave the site and it'll be marked automatically.
            </Text>
          </Card>
        )}

        {!resumedOpenSession && todaysSchedule.length > 0 && (
          <Card>
            <SectionLabel>Scheduled for you today</SectionLabel>
            {todaysSchedule.map((s) => {
              const b = getBeneficiary(s.beneficiaryId);
              const assisting = s.assistantId === currentUser?.id && s.facilitatorId !== currentUser?.id;
              return (
                <Text key={s.id} style={{ color: colors.textMuted, fontSize: 12 }}>
                  {s.time} -- {b?.school} {b?.class} {b?.section}
                  {assisting ? ' (assisting)' : ''}
                </Text>
              );
            })}
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.sm }}>
              You're not limited to these -- checking in anywhere with a
              registered geofence works, and it'll be flagged if it's not on
              today's list.
            </Text>
          </Card>
        )}

        {!resumedOpenSession && (
          <Card>
            <SectionLabel>Location check-in</SectionLabel>
            {geoMatch && (
              <Text style={{ color: colors.green, fontWeight: '700', marginBottom: spacing.sm }}>
                Inside geofence: {geoMatch.school}{geoMatch.label ? ' - ' + geoMatch.label : ''} ({Math.round(geoMatch.distance)}m from centre)
              </Text>
            )}
            {checkFailed && !geoMatch && (
              <Text style={{ color: colors.red, fontWeight: '700', marginBottom: spacing.sm }}>
                You're not currently inside any registered geofence. Attendance can't be marked until you are.
              </Text>
            )}
            {checking ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <SecondaryButton title={geoMatch ? 'Re-check location' : 'Check my location again'} onPress={checkLocation} />
            )}

            {candidateBeneficiaries.length > 1 && (
              <View style={{ marginTop: spacing.md }}>
                <SectionLabel>Multiple classes at this location -- which one are you with?</SectionLabel>
                <Select
                  value={beneficiaryId}
                  onSelect={setBeneficiaryId}
                  options={candidateBeneficiaries.map((b) => ({ value: b.id, label: `${b.class} ${b.section}` }))}
                />
              </View>
            )}

            {beneficiary && (
              <Text style={{ color: isScheduled ? colors.textMuted : colors.amber, fontSize: 12, marginTop: spacing.sm }}>
                Checking in for: {beneficiary.school} {beneficiary.class} {beneficiary.section}
                {!isScheduled && ' -- ad-hoc visit, not on today\'s schedule'}
              </Text>
            )}
          </Card>
        )}

        {!resumedOpenSession && (
          <Card>
            <SectionLabel>Face check</SectionLabel>
            {faceVerified ? (
              <Text style={{ color: colors.green, fontWeight: '700' }}>Face matched -- {currentUser?.name}</Text>
            ) : (
              <>
                <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
                  Live camera capture, matched on-device against your Facial Data.
                </Text>
                <SecondaryButton title="Verify face" onPress={verifyFace} disabled={!beneficiary} />
              </>
            )}
          </Card>
        )}

        <Card>
          <SectionLabel>Time log</SectionLabel>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <View>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Time in</Text>
              <Text style={{ fontWeight: '700', color: colors.text }}>{timeIn || '--:--'}</Text>
            </View>
            <View>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Time out</Text>
              <Text style={{ fontWeight: '700', color: colors.text }}>{timeOut || '--:--'}</Text>
            </View>
          </View>
          {!timeIn ? (
            <PrimaryButton
              title={saving ? 'Saving...' : 'Mark time in'}
              disabled={!canMarkTime || saving}
              onPress={markTimeIn}
            />
          ) : !timeOut ? (
            <PrimaryButton title={saving ? 'Saving...' : 'Mark time out'} disabled={saving} onPress={() => markTimeOut()} />
          ) : (
            <Text style={{ color: colors.green, fontWeight: '700', textAlign: 'center' }}>
              Session attendance complete
            </Text>
          )}
          {!canMarkTime && !timeIn && !resumedOpenSession && (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.sm }}>
              Check your location and pass the face check to enable time in.
            </Text>
          )}
          {!isScheduled && beneficiary && timeIn && (
            <Text style={{ color: colors.amber, fontSize: 12, marginTop: spacing.sm }}>
              Saved with an ad-hoc remark -- {beneficiary.school} {beneficiary.class} {beneficiary.section} wasn't on
              today's schedule. Visible to your Admin on their dashboard.
            </Text>
          )}
          {timeOut && (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.sm }}>
              Head to Sessions to log the category, rating and headcount for this visit.
            </Text>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
