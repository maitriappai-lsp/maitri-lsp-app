// SCREEN 2 (Admin): Schedule -- two-step recurring session builder.
// Step 1 generates dates from a recurrence rule (Monthly = every 4 weeks,
// per the spec's confirmed decision). Step 2 assigns a category to each
// generated date individually, since category can vary session to session.
import React, { useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useData } from '../../data/store';
import { apiPost } from '../../data/api';
import { Screen, Card, SectionLabel, Field, Select, PrimaryButton, SecondaryButton, DateField } from '../../components/UI';
import { colors, spacing } from '../../theme';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_INDEX = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
const FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly'];
const FREQUENCY_DAYS = { Weekly: 7, Fortnightly: 14, Monthly: 28 }; // Monthly = every 4 weeks, confirmed

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

export default function ScheduleScreen() {
  const { db, addRecord, deleteRecord, updateRecord, nextIds, refresh } = useData();

  const [beneficiaryId, setBeneficiaryId] = useState(db.beneficiaries[0]?.id);
  const [facilitatorId, setFacilitatorId] = useState(
    db.resources.find((r) => r.role === 'Facilitator')?.id
  );
  const [frequency, setFrequency] = useState('Weekly');
  const [dayOfWeek, setDayOfWeek] = useState('Monday');
  const [startDate, setStartDate] = useState('2026-09-21');
  const [endDate, setEndDate] = useState('2026-12-11');
  const [time, setTime] = useState('10:00');

  const [step, setStep] = useState(1);
  const [generatedDates, setGeneratedDates] = useState([]);
  const [categoryBySession, setCategoryBySession] = useState({});

  const facilitators = db.resources.filter((r) => r.role === 'Facilitator');

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
        date,
        time,
        categoryId: categoryBySession[date],
      });
    });
    Alert.alert('Schedule saved', `${generatedDates.length} session(s) added to the calendar.`);
    setStep(1);
    setGeneratedDates([]);
    setCategoryBySession({});
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

        {step === 1 && (
          <Card>
            <SectionLabel>Step 1 -- define the recurrence</SectionLabel>
            <SectionLabel>Beneficiary</SectionLabel>
            <Select
              value={beneficiaryId}
              onSelect={setBeneficiaryId}
              options={db.beneficiaries.map((b) => ({ value: b.id, label: `${b.school} - ${b.class}` }))}
            />
            <SectionLabel>Facilitator</SectionLabel>
            <Select
              value={facilitatorId}
              onSelect={setFacilitatorId}
              options={facilitators.map((f) => ({ value: f.id, label: f.name }))}
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
            <Field label="Time" value={time} onChangeText={setTime} placeholder="10:00" />
            <PrimaryButton title="Generate dates" onPress={handleGenerate} />
          </Card>
        )}

        {step === 2 && (
          <Card>
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
          </Card>
        )}

        <SectionLabel>Annual schedule</SectionLabel>
        {db.schedule
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((s) => {
            const b = db.beneficiaries.find((x) => x.id === s.beneficiaryId);
            const f = db.resources.find((x) => x.id === s.facilitatorId);
            return (
              <Card key={s.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{b?.school}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {s.date} - {s.time} - {f?.name} assigned
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert('Delete session', `Remove ${b?.school} on ${s.date}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('schedule', s.id) },
                      ])
                    }
                  >
                    <Text style={{ color: colors.red, fontWeight: '700' }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            );
          })}

        <Card>
          <SectionLabel>Import from Excel</SectionLabel>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
            Bulk-upload the entire schedule master directly, as an alternative to the recurrence builder above.
            Column headers (row 1): School, Class, Section, Facilitator Phone, Date, Time, Pillar, Topic, Subtopic
            (Pillar/Topic/Subtopic optional).
          </Text>
          <SecondaryButton title={importing ? 'Importing...' : 'Choose file & import'} onPress={importSchedule} disabled={importing} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
