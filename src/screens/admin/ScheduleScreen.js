// SCREEN 2 (Admin): Schedule -- two-step recurring session builder.
// Step 1 generates dates from a recurrence rule (Monthly = every 4 weeks,
// per the spec's confirmed decision). Step 2 assigns a category to each
// generated date individually, since category can vary session to session.
//
// Layout: the annual schedule list comes first, with a round "+" button at
// the top right. Tapping "+" opens the two-step builder in a popup.
// Row actions (edit / delete) are compact icons.
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
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useData } from '../../data/store';
import { apiPost } from '../../data/api';
import { Screen, Card, SectionLabel, Field, Select, PrimaryButton, SecondaryButton, DateField, TimeField } from '../../components/UI';
import { colors, spacing } from '../../theme';
import { parseTimeToMinutes, todayLocalYMD } from '../../utils/date';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_INDEX = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
const FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly'];
const FREQUENCY_DAYS = { Weekly: 7, Fortnightly: 14, Monthly: 28 }; // Monthly = every 4 weeks, confirmed

// The assistant is optional. Select needs a real value for every option, so
// "no assistant" is represented by this sentinel in the UI and converted to
// null before anything is saved. An assistant can't be the same person as
// the session's facilitator, so that person is left out of the options.
const NO_ASSISTANT = 'NONE';
function assistantOptions(facilitators, excludeId) {
  return [
    { value: NO_ASSISTANT, label: 'None' },
    ...facilitators.filter((f) => f.id !== excludeId).map((f) => ({ value: f.id, label: f.name })),
  ];
}

function generateDates(startDate, endDate, dayOfWeek, frequency) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const targetDow = DAY_INDEX[dayOfWeek];
  // Move start forward to the first matching day-of-week on or after start.
  const first = new Date(start);
  while (first.getDay() !== targetDow) first.setDate(first.getDate() + 1);
  const stepDays = FREQUENCY_DAYS[frequency];
  const dates = [];
  const cursor = new Date(first);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + stepDays);
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

// Small tappable icon used in each record row (edit / delete).
function IconButton({ name, color, label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={{ padding: 6 }}
    >
      <Ionicons name={name} size={22} color={color} />
    </TouchableOpacity>
  );
}

// Row above the list: "Annual schedule (12)" on the left, "+" on the right.
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

// Bottom-sheet popup that holds the "Add sessions" builder.
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

export default function ScheduleScreen() {
  const { db, addRecord, deleteRecord, updateRecord, nextIds, refresh } = useData();

  const [beneficiaryId, setBeneficiaryId] = useState(db.beneficiaries[0]?.id);
  const [facilitatorId, setFacilitatorId] = useState(
    db.resources.find((r) => r.role === 'Facilitator')?.id
  );
  const [assistantId, setAssistantId] = useState(NO_ASSISTANT);
  const [frequency, setFrequency] = useState('Weekly');
  const [dayOfWeek, setDayOfWeek] = useState('Monday');
  const [startDate, setStartDate] = useState('2026-09-21');
  const [endDate, setEndDate] = useState('2026-12-11');
  const [time, setTime] = useState('10:00');

  const [showAdd, setShowAdd] = useState(false);
  const [step, setStep] = useState(1);
  const [generatedDates, setGeneratedDates] = useState([]);
  const [categoryBySession, setCategoryBySession] = useState({});

  const facilitators = db.resources.filter((r) => r.role === 'Facilitator');

  // Closes the popup and returns the builder to step 1 for next time.
  function closeAdd() {
    setShowAdd(false);
    setStep(1);
    setGeneratedDates([]);
    setCategoryBySession({});
  }

  function handleGenerate() {
    const dates = generateDates(startDate, endDate, dayOfWeek, frequency);
    if (dates.length === 0) {
      Alert.alert('No dates generated', 'Check your start/end dates and day of week.');
      return;
    }
    setGeneratedDates(dates);
    const defaults = {};
    dates.forEach((d) => (defaults[d] = db.categories[0]?.id));
    setCategoryBySession(defaults);
    setStep(2);
  }

  function confirmAndSaveAll() {
    const ids = nextIds('SCH', 'schedule', generatedDates.length);
    generatedDates.forEach((date, i) => {
      addRecord('schedule', {
        id: ids[i],
        beneficiaryId,
        facilitatorId,
        assistantId: assistantId === NO_ASSISTANT ? null : assistantId,
        date,
        time,
        categoryId: categoryBySession[date],
      });
    });
    Alert.alert(
      'Schedule saved',
      `${generatedDates.length} session(s) added to the calendar.`,
      [{ text: 'OK', onPress: closeAdd }],
      { cancelable: false }
    );
  }

  // ---- Edit an existing scheduled session --------------------------------
  const [editingId, setEditingId] = useState(null);
  const [editBeneficiaryId, setEditBeneficiaryId] = useState(null);
  const [editFacilitatorId, setEditFacilitatorId] = useState(null);
  const [editAssistantId, setEditAssistantId] = useState(NO_ASSISTANT);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editCategoryId, setEditCategoryId] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  function startEdit(sess) {
    setEditingId(sess.id);
    setEditBeneficiaryId(sess.beneficiaryId);
    setEditFacilitatorId(sess.facilitatorId);
    setEditAssistantId(sess.assistantId || NO_ASSISTANT);
    setEditDate(sess.date);
    setEditTime(sess.time || '');
    setEditCategoryId(sess.categoryId);
  }

  async function saveEdit() {
    if (!editBeneficiaryId) return Alert.alert('Beneficiary required', 'Select a beneficiary.');
    if (!editFacilitatorId) return Alert.alert('Facilitator required', 'Select a facilitator.');
    if (editAssistantId !== NO_ASSISTANT && editAssistantId === editFacilitatorId) {
      return Alert.alert('Check the assistant', 'The assistant cannot be the same person as the facilitator.');
    }
    if (!editDate) return Alert.alert('Date required', 'Pick a date.');
    if (editDate < todayLocalYMD()) {
      return Alert.alert('Date is in the past', 'A scheduled session cannot be dated before today.');
    }
    if (parseTimeToMinutes(editTime) == null) {
      return Alert.alert('Check the time', 'Enter a time like 10:00 or 10:00 AM.');
    }
    setSavingEdit(true);
    try {
      await updateRecord('schedule', editingId, {
        beneficiaryId: editBeneficiaryId,
        facilitatorId: editFacilitatorId,
        assistantId: editAssistantId === NO_ASSISTANT ? null : editAssistantId,
        date: editDate,
        time: editTime.trim(),
        categoryId: editCategoryId || null,
      });
      setEditingId(null);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSavingEdit(false);
    }
  }

  const [importing, setImporting] = useState(false);

  async function importSchedule() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
    });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' });
      const outcome = await apiPost('/api/import/schedule', formData);
      await refresh();
      const errorPreview = outcome.errors?.length
        ? `\n\nFirst issue: ${outcome.errors[0]}${outcome.errors.length > 1 ? ` (+${outcome.errors.length - 1} more)` : ''}`
        : '';
      Alert.alert('Import complete', `${outcome.inserted} session(s) added, ${outcome.skipped} skipped.${errorPreview}`);
    } catch (e) {
      Alert.alert('Import failed', e.message || 'Please try again.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md }}>
          Schedule
        </Text>

        <ListHeader
          title="Annual schedule"
          count={db.schedule.length}
          onAdd={() => setShowAdd(true)}
          addLabel="Add sessions"
        />

        <AddModal
          visible={showAdd}
          title={step === 1 ? 'Add sessions (step 1 of 2)' : 'Add sessions (step 2 of 2)'}
          onClose={closeAdd}
        >
          {step === 1 && (
            <View>
              <SectionLabel>Step 1 -- define the recurrence</SectionLabel>
              <SectionLabel>Beneficiary</SectionLabel>
              <Select
                value={beneficiaryId}
                onSelect={setBeneficiaryId}
                options={db.beneficiaries.map((b) => ({
                  value: b.id,
                  label: `${b.school} - ${b.class}${b.section ? ' ' + b.section : ''}`,
                }))}
              />
              <SectionLabel>Facilitator</SectionLabel>
              <Select
                value={facilitatorId}
                onSelect={(v) => {
                  setFacilitatorId(v);
                  if (v === assistantId) setAssistantId(NO_ASSISTANT);
                }}
                options={facilitators.map((f) => ({ value: f.id, label: f.name }))}
              />
              <SectionLabel>Assistant (optional)</SectionLabel>
              <Select
                value={assistantId}
                onSelect={setAssistantId}
                options={assistantOptions(facilitators, facilitatorId)}
              />
              <SectionLabel>Frequency</SectionLabel>
              <Select
                value={frequency}
                onSelect={setFrequency}
                options={FREQUENCIES.map((f) => ({ value: f, label: f === 'Monthly' ? 'Monthly (every 4 weeks)' : f }))}
              />
              <SectionLabel>Day of week</SectionLabel>
              <Select value={dayOfWeek} onSelect={setDayOfWeek} options={DAYS.map((d) => ({ value: d, label: d }))} />
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <DateField label="Start date" value={startDate} onChange={setStartDate} />
                </View>
                <View style={{ flex: 1 }}>
                  <DateField label="End date" value={endDate} onChange={setEndDate} />
                </View>
              </View>
              <TimeField label="Time" value={time} onChange={setTime} />
              <PrimaryButton title="Generate dates" onPress={handleGenerate} />
            </View>
          )}

          {step === 2 && (
            <View>
              <SectionLabel>Step 2 -- assign category per session ({generatedDates.length} dates)</SectionLabel>
              {generatedDates.map((date) => (
                <View key={date} style={{ marginBottom: spacing.md }}>
                  <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 4 }}>{date}</Text>
                  <Select
                    value={categoryBySession[date]}
                    onSelect={(v) => setCategoryBySession((prev) => ({ ...prev, [date]: v }))}
                    options={db.categories.map((c) => ({ value: c.id, label: `${c.pillar} / ${c.topic}` }))}
                  />
                </View>
              ))}
              <PrimaryButton title="Confirm & save all" onPress={confirmAndSaveAll} />
              <SecondaryButton title="Back" onPress={() => setStep(1)} style={{ marginTop: spacing.sm }} />
            </View>
          )}
        </AddModal>

        {db.schedule
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((s) => {
            const b = db.beneficiaries.find((x) => x.id === s.beneficiaryId);
            const f = db.resources.find((x) => x.id === s.facilitatorId);
            const asst = s.assistantId ? db.resources.find((x) => x.id === s.assistantId) : null;
            const c = db.categories.find((x) => x.id === s.categoryId);

            if (editingId === s.id) {
              return (
                <Card key={s.id}>
                  <Text style={{ fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>
                    Editing session
                  </Text>
                  <Select
                    label="Beneficiary"
                    value={editBeneficiaryId}
                    onSelect={setEditBeneficiaryId}
                    options={db.beneficiaries.map((x) => ({
                      value: x.id,
                      label: `${x.school} - ${x.class}${x.section ? ' ' + x.section : ''}`,
                    }))}
                  />
                  <Select
                    label="Facilitator"
                    value={editFacilitatorId}
                    onSelect={(v) => {
                      setEditFacilitatorId(v);
                      if (v === editAssistantId) setEditAssistantId(NO_ASSISTANT);
                    }}
                    options={facilitators.map((x) => ({ value: x.id, label: x.name }))}
                  />
                  <Select
                    label="Assistant (optional)"
                    value={editAssistantId}
                    onSelect={setEditAssistantId}
                    options={assistantOptions(facilitators, editFacilitatorId)}
                  />
                  <View style={{ flexDirection: 'row', gap: spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <DateField label="Date" value={editDate} onChange={setEditDate} minimumDate={new Date()} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TimeField label="Time" value={editTime} onChange={setEditTime} />
                    </View>
                  </View>
                  <Select
                    label="Category"
                    value={editCategoryId}
                    onSelect={setEditCategoryId}
                    options={db.categories.map((x) => ({ value: x.id, label: `${x.pillar} / ${x.topic}` }))}
                  />
                  <PrimaryButton title={savingEdit ? 'Saving...' : 'Save changes'} onPress={saveEdit} disabled={savingEdit} />
                  <SecondaryButton title="Cancel" onPress={() => setEditingId(null)} style={{ marginTop: spacing.sm }} />
                </Card>
              );
            }

            return (
              <Card key={s.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{b?.school}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {s.date} - {s.time} - {f?.name} assigned
                    </Text>
                    {asst && (
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        Assistant: {asst.name}
                      </Text>
                    )}
                    {c && (
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {c.pillar} / {c.topic}
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => startEdit(s)} />
                    <IconButton
                      name="trash-outline"
                      color={colors.red}
                      label="Delete"
                      onPress={() =>
                        Alert.alert('Delete session', `Remove ${b?.school} on ${s.date}?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('schedule', s.id) },
                        ])
                      }
                    />
                  </View>
                </View>
              </Card>
            );
          })}

        <Card>
          <SectionLabel>Import from Excel</SectionLabel>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
            Bulk-upload the entire schedule master directly, as an alternative to the recurrence builder above.
            Column headers (row 1): School, Class, Section, Facilitator Phone, Date, Time, Pillar, Topic, Subtopic,
            Assistant Phone (Pillar/Topic/Subtopic and Assistant Phone optional).
          </Text>
          <SecondaryButton title={importing ? 'Importing...' : 'Choose file & import'} onPress={importSchedule} disabled={importing} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
