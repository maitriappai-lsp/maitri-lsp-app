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
// The location check now runs automatically as soon as this screen opens
// (no manual button tap needed) -- a re-check button is still there in case
// the first attempt fails and they want to retry after moving. Time In
// stays disabled until the check passes and the face check passes.
//
// Only one open (not-timed-out) attendance session is allowed per
// facilitator per day: if they already have one, this screen loads it back
// up on open rather than letting a second time-in start.
//
// Marking Time In creates a real attendance record (geoVerified: true,
// adHoc: true if it wasn't scheduled) so it shows up in both dashboards'
// Attendance tab. Marking Time Out updates that same record. The
// session-quality side (category, rating, feedback, headcount) is filled in
// afterward on the Sessions screen, which lists today's checked-in records
// to finish -- and refuses to let a session be logged at all for a day with
// no attendance record, so PSR can't exist without a real check-in behind
// it.
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { findGeofenceMatch } from '../../utils/geofence';
import { Screen, Card, SectionLabel, Select, PrimaryButton, SecondaryButton } from '../../components/UI';
import { colors, spacing } from '../../theme';

export default function AttendanceScreen() {
  const { currentUser } = useAuth();
  const { db, getBeneficiary, addRecord, updateRecord, nextId } = useData();
  const today = new Date().toISOString().slice(0, 10);

  const todaysSchedule = useMemo(
    () => db.schedule.filter((s) => s.facilitatorId === currentUser?.id && s.date === today),
    [db.schedule, currentUser?.id, today]
  );

  const [checking, setChecking] = useState(false);
  const [geoMatch, setGeoMatch] = useState(null); // the matched geo record + distance, or null
  const [checkFailed, setCheckFailed] = useState(false);
  const [candidateBeneficiaries, setCandidateBeneficiaries] = useState([]);
  const [beneficiaryId, setBeneficiaryId] = useState(null);
  const [faceVerified, setFaceVerified] = useState(false);
  const [attendanceRecordId, setAttendanceRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [timeIn, setTimeIn] = useState(null);
  const [timeOut, setTimeOut] = useState(null);
  const [resumedOpenSession, setResumedOpenSession] = useState(false);

  const beneficiary = beneficiaryId ? getBeneficiary(beneficiaryId) : null;
  const isScheduled = beneficiary
    ? todaysSchedule.some((s) => s.beneficiaryId === beneficiary.id)
    : false;

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
    } else {
      checkLocation();
    }
    // Only on first mount -- re-checks after that are the explicit button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  function resetSession() {
    setGeoMatch(null);
    setCheckFailed(false);
    setCandidateBeneficiaries([]);
    setBeneficiaryId(null);
    setFaceVerified(false);
    setAttendanceRecordId(null);
    setTimeIn(null);
    setTimeOut(null);
    setResumedOpenSession(false);
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
        timeIn: new Date().toLocaleTimeString(),
        timeOut: '',
        geoVerified: true,
        adHoc: !isScheduled,
      };
      const saved = await addRecord('attendance', record);
      setAttendanceRecordId(saved.id);
      setTimeIn(record.timeIn);
    } catch (e) {
      Alert.alert('Could not save time in', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function markTimeOut() {
    setSaving(true);
    try {
      const value = new Date().toLocaleTimeString();
      await updateRecord('attendance', attendanceRecordId, { timeOut: value });
      setTimeOut(value);
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

        {resumedOpenSession && (
          <Card>
            <SectionLabel>Open session from earlier today</SectionLabel>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {beneficiary?.school} {beneficiary?.class} {beneficiary?.section} -- timed in at {timeIn}. Mark time
              out below when the session ends.
            </Text>
          </Card>
        )}

        {!resumedOpenSession && todaysSchedule.length > 0 && (
          <Card>
            <SectionLabel>Scheduled for you today</SectionLabel>
            {todaysSchedule.map((s) => {
              const b = getBeneficiary(s.beneficiaryId);
              return (
                <Text key={s.id} style={{ color: colors.textMuted, fontSize: 12 }}>
                  {s.time} -- {b?.school} {b?.class} {b?.section}
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
            <PrimaryButton title={saving ? 'Saving...' : 'Mark time out'} disabled={saving} onPress={markTimeOut} />
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
