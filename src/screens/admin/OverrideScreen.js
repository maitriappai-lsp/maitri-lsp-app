// SCREEN 3 (Admin): Attendance Override.
// "Correct attendance time" directly corrects time in/out (and the
// beneficiary) on one or more existing attendance rows -- or backfills
// missing ones -- for a facilitator over a date or date range. The reason,
// who made the change and when are stored on the attendance record itself
// for audit. Only ACTIVE facilitators can be picked, since an inactive one
// isn't currently working.
//
// Layout: the list of past corrections (the audit trail) comes first, with a
// round "+" button at the top right. Tapping "+" opens the correction form in
// a popup.
import React, { useState } from 'react';
import {
  ScrollView,
  Text,
  View,
  Alert,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
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

// Round "+" button shown at the top-right of the list.
function AddButton({ onPress, label }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <Text style={{ color: '#fff', fontSize: 28, lineHeight: 30, fontWeight: '600' }}>+</Text>
    </TouchableOpacity>
  );
}

// Row above the list: "Corrections (4)" on the left, "+" on the right.
function ListHeader({ title, count, onAdd, addLabel }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
        {title} ({count})
      </Text>
      <AddButton onPress={onAdd} label={addLabel} />
    </View>
  );
}

// Bottom-sheet popup that holds the correction form.
function AddModal({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        enabled={Platform.OS === 'ios'}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: colors.bg,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: spacing.lg,
              maxHeight: '90%',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function OverrideScreen() {
  const { currentUser } = useAuth();
  const { db, addRecord, updateRecord, nextId } = useData();
  const activeFacilitators = db.resources.filter((r) => r.role === 'Facilitator' && r.active !== false);

  // ---- Correct attendance time -------------------------------------------
  const [showAdd, setShowAdd] = useState(false);
  const [timeResourceId, setTimeResourceId] = useState(activeFacilitators[0]?.id);
  const [timeBeneficiaryId, setTimeBeneficiaryId] = useState('');
  const [startDate, setStartDate] = useState(todayLocalYMD());
  const [endDate, setEndDate] = useState('');
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
  const [timeReason, setTimeReason] = useState('');
  const [savingTime, setSavingTime] = useState(false);

  // Times can't be in the future on today's date, so the time pickers
  // enforce that whenever the chosen date (or range) includes today.
  const todayForPickers = todayLocalYMD();
  const rangeHitsToday =
    startDate === todayForPickers ||
    (!!endDate && startDate <= todayForPickers && endDate >= todayForPickers);

  // Past corrections, newest first (the audit trail shown on this screen).
  const corrections = db.attendance
    .filter((a) => a.overridden)
    .slice()
    .sort((a, b) => String(b.overriddenAt || '').localeCompare(String(a.overriddenAt || '')))
    .slice(0, 50);

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
        `Attendance updated: ${updated} record(s) corrected, ${created} record(s) created.`,
        [{ text: 'OK', onPress: () => setShowAdd(false) }]
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
          Only active facilitators can be selected. Every correction is saved with a reason for audit.
        </Text>

        <ListHeader
          title="Corrections"
          count={corrections.length}
          onAdd={() => setShowAdd(true)}
          addLabel="Correct attendance"
        />

        <AddModal visible={showAdd} title="Correct attendance time" onClose={() => setShowAdd(false)}>
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
              <TimeField label="Time in" value={timeIn} onChange={setTimeIn} blockFutureOn={rangeHitsToday ? todayForPickers : undefined} />
            </View>
            <View style={{ flex: 1 }}>
              <TimeField label="Time out" value={timeOut} onChange={setTimeOut} blockFutureOn={rangeHitsToday ? todayForPickers : undefined} />
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
        </AddModal>

        {corrections.length === 0 ? (
          <Card>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              No corrections yet. Tap + to correct a facilitator's attendance.
            </Text>
          </Card>
        ) : (
          corrections.map((a) => {
            const f = db.resources.find((x) => x.id === a.facilitatorId);
            const b = db.beneficiaries.find((x) => x.id === a.beneficiaryId);
            const by = db.resources.find((x) => x.id === a.overriddenBy);
            return (
              <Card key={a.id}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{f?.name || a.facilitatorId}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {a.date} - in {a.timeIn || '—'} / out {a.timeOut || '—'}
                </Text>
                {b && (
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {b.school} - {b.class}{b.section ? ' ' + b.section : ''}
                  </Text>
                )}
                {!!a.overrideReason && (
                  <Text style={{ color: colors.text, fontSize: 12, marginTop: 4 }}>Reason: {a.overrideReason}</Text>
                )}
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                  Corrected {a.overriddenAt ? String(a.overriddenAt).slice(0, 10) : ''}
                  {by ? ` by ${by.name}` : ''}
                </Text>
              </Card>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
