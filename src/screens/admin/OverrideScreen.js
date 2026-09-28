// SCREEN 3 (Admin): Attendance Override.
// Two things happen here:
//  1. "Bypass checks" -- logs a note that geofence/face were bypassed for a
//     facilitator going forward (existing behaviour), audit-logged in the
//     `overrides` table.
//  2. "Correct attendance time" -- directly corrects time in/out on one or
//     more existing attendance rows (or backfills missing ones) for a
//     facilitator over a date or date range, per the spec's requirement
//     that overrides be reason-logged on the attendance record itself for
//     audit. Also mirrored into the `overrides` log so both kinds of
//     override show up in one place below.
// Only ACTIVE resources can be picked in either section -- an inactive
// facilitator isn't currently working, so overriding their attendance
// wouldn't make sense.
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { Screen, Card, SectionLabel, Select, Field, DateField, TimeField, PrimaryButton } from '../../components/UI';
import { colors, spacing } from '../../theme';
import { toLocalYMD, todayLocalYMD, isFutureTime } from '../../utils/date';

function dateRange(from, to) {
  const dates = [];
  let d = new Date(from + 'T00:00:00');
  const end = new Date((to || from) + 'T00:00:00');
  while (d <= end) {
    dates.push(toLocalYMD(d));
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

export default function OverrideScreen() {
  const { currentUser } = useAuth();
  const { db, addRecord, updateRecord, nextId, logOverride } = useData();
  const activeFacilitators = db.resources.filter((r) => r.role === 'Facilitator' && r.active !== false);

  // ---- Bypass checks (existing) -----------------------------------------
  const [resourceId, setResourceId] = useState(activeFacilitators[0]?.id);
  const [bypassGeofence, setBypassGeofence] = useState(false);
  const [bypassFace, setBypassFace] = useState(false);
  const [reason, setReason] = useState('');

  function submitBypass() {
    if (!reason.trim()) {
      Alert.alert('Reason required', 'Every override must be logged with a reason for audit.');
      return;
    }
    if (!bypassGeofence && !bypassFace) {
      Alert.alert('Nothing to override', 'Toggle at least one bypass.');
      return;
    }
    logOverride({
      resourceId,
      bypassGeofence,
      bypassFace,
      reason: reason.trim(),
      loggedBy: currentUser?.id,
    });
    setReason('');
    setBypassGeofence(false);
    setBypassFace(false);
  }

  // ---- Correct attendance time (new) -------------------------------------
  const [timeResourceId, setTimeResourceId] = useState(activeFacilitators[0]?.id);
  const [timeBeneficiaryId, setTimeBeneficiaryId] = useState('');
  const [startDate, setStartDate] = useState(todayLocalYMD());
  const [endDate, setEndDate] = useState('');
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
  const [timeReason, setTimeReason] = useState('');
  const [savingTime, setSavingTime] = useState(false);

  async function submitTimeCorrection() {
    if (!timeResourceId) return Alert.alert('Resource required', 'Select a facilitator.');
    if (!timeBeneficiaryId) {
      return Alert.alert('Beneficiary required', 'Select the beneficiary this attendance is for.');
    }
    if (!timeIn && !timeOut) return Alert.alert('Nothing to update', 'Set a time in and/or time out.');
    if (!timeReason.trim()) {
      Alert.alert('Reason required', 'Every attendance correction must be logged with a reason for audit.');
      return;
    }
    const todayStr = todayLocalYMD();
    if (startDate > todayStr || (endDate && endDate > todayStr)) {
      Alert.alert('Date is in the future', 'Attendance can only be corrected for today or earlier dates.');
      return;
    }
    const rangeIncludesToday = startDate === todayStr || (endDate && startDate <= todayStr && endDate >= todayStr);
    if (rangeIncludesToday && ((timeIn && isFutureTime(todayStr, timeIn)) || (timeOut && isFutureTime(todayStr, timeOut)))) {
      Alert.alert('Time is in the future', 'Time in and time out cannot be later than the current time.');
      return;
    }
    if (endDate && endDate < startDate) {
      Alert.alert('Check the dates', 'End date must be on or after the start date.');
      return;
    }
    if (timeIn && timeOut && timeOut <= timeIn) {
      Alert.alert('Check the times', 'Time out must be later than time in.');
      return;
    }

    setSavingTime(true);
    try {
      const dates = dateRange(startDate, endDate);
      const trimmedReason = timeReason.trim();
      const nowIso = new Date().toISOString();
      let created = 0;
      let updated = 0;

      for (const date of dates) {
        const matches = db.attendance.filter(
          (a) =>
            a.facilitatorId === timeResourceId &&
            a.date === date &&
            (a.beneficiaryId === timeBeneficiaryId || !a.beneficiaryId)
        );
        const patch = {
          beneficiaryId: timeBeneficiaryId,
          ...(timeIn ? { timeIn } : {}),
          ...(timeOut ? { timeOut } : {}),
          overridden: true,
          overrideReason: trimmedReason,
          overriddenBy: currentUser?.id,
          overriddenAt: nowIso,
        };

        if (matches.length > 0) {
          for (const m of matches) {
            await updateRecord('attendance', m.id, patch);
          }
          updated += matches.length;
        } else {
          await addRecord('attendance', {
            id: nextId('ATT-OV', 'attendance'),
            facilitatorId: timeResourceId,
            date,
            timeIn: timeIn || null,
            timeOut: timeOut || null,
            geoVerified: false,
            adHoc: true,
            ...patch,
          });
          created += 1;
        }
      }

      Alert.alert(
        'Saved',
        `Attendance updated: ${updated} record(s) corrected, ${created} record(s) created.`
      );
      setTimeIn('');
      setTimeOut('');
      setTimeReason('');
      setTimeBeneficiaryId('');
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSavingTime(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.xl }}
      >
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.xs }}>
          Attendance Override
        </Text>
        <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
          Only active resources can be selected below. Every override is logged with a reason.
        </Text>

      <SectionLabel>Correct attendance time</SectionLabel>
      <Card>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
          Pick a single date, or a date range to apply the same correction across several days
          (e.g. a facilitator whose check-ins failed to record for a stretch of days).
        </Text>
        <SectionLabel>Facilitator (active only)</SectionLabel>
        <Select
          value={timeResourceId}
          onSelect={setTimeResourceId}
          options={activeFacilitators.map((f) => ({ value: f.id, label: f.name }))}
          placeholder="Select facilitator"
        />
        <SectionLabel>Beneficiary (required)</SectionLabel>
        <Select
          value={timeBeneficiaryId}
          onSelect={setTimeBeneficiaryId}
          options={db.beneficiaries.map((b) => ({
            value: b.id,
            label: `${b.school} - ${b.class}${b.section ? ' ' + b.section : ''}`,
          }))}
          placeholder="Select beneficiary"
        />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <DateField label="Date" value={startDate} onChange={setStartDate} maximumDate={new Date()} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label="End date (optional)" value={endDate} onChange={setEndDate} maximumDate={new Date()} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <TimeField label="Time in" value={timeIn} onChange={setTimeIn} />
          </View>
          <View style={{ flex: 1 }}>
            <TimeField label="Time out" value={timeOut} onChange={setTimeOut} />
          </View>
        </View>
        <Field
          label="Reason (required)"
          value={timeReason}
          onChangeText={setTimeReason}
          placeholder="e.g. App crashed before time-out could be marked, confirmed by phone call"
          multiline
        />
        <PrimaryButton
          title={savingTime ? 'Saving...' : 'Save attendance correction'}
          onPress={submitTimeCorrection}
          disabled={savingTime}
        />
      </Card>

      <SectionLabel>Bypass checks</SectionLabel>
      <Card>
        <SectionLabel>Resource (active only)</SectionLabel>
        <Select
          value={resourceId}
          onSelect={setResourceId}
          options={activeFacilitators.map((f) => ({ value: f.id, label: f.name }))}
          placeholder="Select facilitator"
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
          <Select
            value={bypassGeofence ? 'yes' : 'no'}
            onSelect={(v) => setBypassGeofence(v === 'yes')}
            options={[
              { value: 'no', label: 'Bypass geofence: Off' },
              { value: 'yes', label: 'Bypass geofence: On' },
            ]}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
          <Select
            value={bypassFace ? 'yes' : 'no'}
            onSelect={(v) => setBypassFace(v === 'yes')}
            options={[
              { value: 'no', label: 'Bypass face check: Off' },
              { value: 'yes', label: 'Bypass face check: On' },
            ]}
          />
        </View>
        <Field
          label="Reason (required)"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Facilitator's phone camera not working, verified by phone call"
          multiline
        />
        <PrimaryButton title="Log override" onPress={submitBypass} />
      </Card>

      <SectionLabel>Override log</SectionLabel>
      <View>
        {db.overrides.length === 0 && <Text style={{ color: colors.textMuted }}>No overrides logged.</Text>}
        {db.overrides.map((o) => {
          const r = db.resources.find((x) => x.id === o.resourceId);
          return (
            <Card key={o.id}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{r?.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {new Date(o.timestamp).toLocaleString()} - geofence: {o.bypassGeofence ? 'bypassed' : 'no'}, face:{' '}
                {o.bypassFace ? 'bypassed' : 'no'}
              </Text>
              <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>{o.reason}</Text>
            </Card>
          );
        })}
      </View>
      </ScrollView>
    </Screen>
  );
}
