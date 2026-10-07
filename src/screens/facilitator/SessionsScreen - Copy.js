// SCREEN 3 (Facilitator): Sessions (Post-Session Record).
// Single flat form per spec decision (no header/detail split), current
// academic-year only, no future dates.
//
// Attendance's Time In creates a row in the separate `attendance` table
// (check-in/check-out, geofence/face verification, ad-hoc flag) -- this
// screen's job is the session-quality side: category, rating, feedback.
//
// Two ways to create a session record, switched with the tabs at the top
// rather than stacked one after the other:
//  - "Check-ins": attendance rows for today that don't have a linked PSR
//    yet. Saving one creates that PSR, linked back to the attendance row
//    via attendanceId. This is the normal path.
//  - "Add manually": a record for a visit that didn't go through the
//    check-in flow. Still requires some attendance today.
// Both forms share the same fields (SessionFields) and the same
// validation (validateSession), so they can't drift apart.
import React, { useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import {
  Screen,
  Card,
  SectionLabel,
  FieldLabel,
  Field,
  Select,
  Chip,
  PrimaryButton,
  RagChip,
  TimeField,
} from '../../components/UI';
import { colors, spacing, ragColor } from '../../theme';
import { todayLocalYMD, parseTimeToMinutes, isFutureTime } from '../../utils/date';

const RATINGS = ['Excellent', 'Good', 'Needs follow-up'];
const RAGS = ['Green', 'Amber', 'Red'];

// ---- Small building blocks -------------------------------------------------

function Segmented({ tabs, value, onChange }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.chipBg,
        borderRadius: 10,
        padding: 4,
        marginBottom: spacing.lg,
      }}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <TouchableOpacity
            key={t.key}
            onPress={() => onChange(t.key)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 8,
              alignItems: 'center',
              backgroundColor: active ? colors.card : 'transparent',
              borderWidth: active ? 1 : 0,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontWeight: '700', color: active ? colors.primary : colors.textMuted }}>
              {t.label}
              {t.count > 0 ? `  (${t.count})` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// A short pick-one list (rating, RAG, Yes/No) as a row of chips -- more
// compact and quicker to tap than a dropdown for two or three options.
function ChoiceRow({ label, options, value, onSelect }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {options.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            active={o.value === value}
            color={o.color}
            onPress={() => onSelect(o.value)}
          />
        ))}
      </View>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />;
}

// ---- Shared form state, fields and validation ------------------------------

function useSessionFields({ timeIn = '', timeOut = '' } = {}) {
  const { db } = useData();
  const [categoryId, setCategoryId] = useState(db.categories[0]?.id);
  const [studentsPresent, setStudentsPresent] = useState('');
  const [timeInValue, setTimeIn] = useState(timeIn);
  const [timeOutValue, setTimeOut] = useState(timeOut);
  const [rating, setRating] = useState('Good');
  const [rag, setRag] = useState('Green');
  const [facilitatorFeedback, setFacilitatorFeedback] = useState('');
  const [schoolFeedback, setSchoolFeedback] = useState('');
  const [externalOrgName, setExternalOrgName] = useState('');
  const [externalResources, setExternalResources] = useState('');
  const [photosUploaded, setPhotosUploaded] = useState(false);

  return {
    categoryId, setCategoryId,
    studentsPresent, setStudentsPresent,
    timeIn: timeInValue, setTimeIn,
    timeOut: timeOutValue, setTimeOut,
    rating, setRating,
    rag, setRag,
    facilitatorFeedback, setFacilitatorFeedback,
    schoolFeedback, setSchoolFeedback,
    externalOrgName, setExternalOrgName,
    externalResources, setExternalResources,
    photosUploaded, setPhotosUploaded,
    // Clears what's specific to one visit, keeping category/rating/RAG.
    reset() {
      setStudentsPresent('');
      setTimeIn('');
      setTimeOut('');
      setFacilitatorFeedback('');
      setSchoolFeedback('');
      setExternalOrgName('');
      setExternalResources('');
      setPhotosUploaded(false);
    },
  };
}

// Returns [title, message] for the first problem, or null if it's valid.
function validateSession(f, date) {
  if (!f.categoryId) return ['Life skill service category required', 'Select a category.'];
  if (!f.timeIn.trim()) return ['Time in required', 'Enter a time in.'];
  if (!f.timeOut.trim()) return ['Time out required', 'Enter a time out.'];
  if (parseTimeToMinutes(f.timeIn) == null || parseTimeToMinutes(f.timeOut) == null) {
    return ['Check the times', 'Enter times like 10:02 AM.'];
  }
  if (isFutureTime(date, f.timeIn) || isFutureTime(date, f.timeOut)) {
    return ['Time is in the future', 'Time in and time out cannot be later than the current time.'];
  }
  if (!f.rag) return ['RAG status required', 'Select a RAG status.'];
  return null;
}

function toPsrFields(f) {
  return {
    timeIn: f.timeIn,
    timeOut: f.timeOut,
    categoryId: f.categoryId,
    studentsPresent: Number(f.studentsPresent) || 0,
    rating: f.rating,
    rag: f.rag,
    facilitatorFeedback: f.facilitatorFeedback,
    schoolFeedback: f.schoolFeedback,
    externalOrgName: f.externalOrgName || null,
    externalResources: f.externalResources || null,
    photosUploaded: f.photosUploaded,
  };
}

function SessionFields({ f, date, beneficiaryPicker }) {
  const { db } = useData();
  // Optional extras stay tucked away unless they're already filled in.
  const [showOptional, setShowOptional] = useState(
    !!(f.externalOrgName || f.externalResources || f.photosUploaded)
  );

  return (
    <>
      {beneficiaryPicker}

      <Select
        label="Life skill service category (required)"
        value={f.categoryId}
        onSelect={f.setCategoryId}
        options={db.categories.map((c) => ({
          value: c.id,
          label: `${c.pillar} / ${c.topic}${c.subtopic !== 'OTHERS' ? ' / ' + c.subtopic : ''}`,
        }))}
      />

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <TimeField
            label="Time in (required)"
            value={f.timeIn}
            onChange={f.setTimeIn}
            blockFutureOn={date === todayLocalYMD() ? date : undefined}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField
            label="Time out (required)"
            value={f.timeOut}
            onChange={f.setTimeOut}
            blockFutureOn={date === todayLocalYMD() ? date : undefined}
          />
        </View>
      </View>

      <Field
        label="Students present"
        value={f.studentsPresent}
        onChangeText={f.setStudentsPresent}
        keyboardType="number-pad"
        placeholder="28"
      />

      <ChoiceRow
        label="Rating (session quality)"
        value={f.rating}
        onSelect={f.setRating}
        options={RATINGS.map((r) => ({ value: r, label: r }))}
      />
      <ChoiceRow
        label="RAG status (required)"
        value={f.rag}
        onSelect={f.setRag}
        options={RAGS.map((r) => ({ value: r, label: r, color: ragColor(r) }))}
      />

      <Divider />

      <Field
        label="Facilitator feedback"
        value={f.facilitatorFeedback}
        onChangeText={f.setFacilitatorFeedback}
        placeholder="What went well / what didn't"
        multiline
      />
      <Field
        label="School feedback"
        value={f.schoolFeedback}
        onChangeText={f.setSchoolFeedback}
        placeholder="Any feedback from the school"
        multiline
      />

      <TouchableOpacity onPress={() => setShowOptional((v) => !v)} style={{ paddingVertical: spacing.sm }}>
        <Text style={{ color: colors.primary, fontWeight: '700' }}>
          {showOptional ? '\u25BE' : '\u25B8'} Optional details
        </Text>
      </TouchableOpacity>
      {showOptional && (
        <View style={{ marginTop: spacing.sm }}>
          <Field
            label="External org name"
            value={f.externalOrgName}
            onChangeText={f.setExternalOrgName}
            placeholder="e.g. a partner NGO involved in this session"
          />
          <Field
            label="External resources"
            value={f.externalResources}
            onChangeText={f.setExternalResources}
            placeholder="e.g. materials or resources an external org provided"
            multiline
          />
          <ChoiceRow
            label="Photos taken and shared"
            value={f.photosUploaded ? 'yes' : 'no'}
            onSelect={(v) => f.setPhotosUploaded(v === 'yes')}
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Yes' },
            ]}
          />
        </View>
      )}
    </>
  );
}

// ---- Tab 1: complete a check-in --------------------------------------------

function CompleteCheckIn({ attendanceRecord }) {
  const { db, addRecord, nextId } = useData();
  const beneficiary = db.beneficiaries.find((b) => b.id === attendanceRecord.beneficiaryId);
  const f = useSessionFields({
    timeIn: attendanceRecord.timeIn || '',
    timeOut: attendanceRecord.timeOut || '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    const problem = validateSession(f, attendanceRecord.date);
    if (problem) return Alert.alert(problem[0], problem[1]);
    setSaving(true);
    try {
      await addRecord('psr', {
        id: nextId('PSR', 'psr'),
        beneficiaryId: attendanceRecord.beneficiaryId,
        facilitatorId: attendanceRecord.facilitatorId,
        date: attendanceRecord.date,
        attendanceId: attendanceRecord.id,
        ...toPsrFields(f),
      });
      // No local "done" state needed -- once a psr with this attendanceId
      // exists, this attendance record naturally drops out of
      // pendingCheckIns on the next render.
      Alert.alert('Saved', 'Session details recorded.');
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, marginRight: spacing.sm }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
            {beneficiary?.school}
          </Text>
          <Text style={{ color: colors.textMuted, marginTop: 2 }}>
            {beneficiary?.class}
            {beneficiary?.section ? ` ${beneficiary.section}` : ''}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
            {attendanceRecord.date} {'\u2022'} {attendanceRecord.timeIn}
            {attendanceRecord.timeOut ? ` to ${attendanceRecord.timeOut}` : ' (time out not marked yet)'}
          </Text>
        </View>
        {attendanceRecord.adHoc && (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.amber,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: colors.amber, fontSize: 11, fontWeight: '700' }}>Ad-hoc visit</Text>
          </View>
        )}
      </View>

      <Divider />

      <SessionFields f={f} date={attendanceRecord.date} />
      <PrimaryButton title={saving ? 'Saving...' : 'Save session details'} onPress={save} disabled={saving} />
    </Card>
  );
}

// ---- Screen ----------------------------------------------------------------

export default function SessionsScreen() {
  const { currentUser } = useAuth();
  const { db, addRecord, nextId } = useData();
  const today = todayLocalYMD();

  const pendingCheckIns = db.attendance.filter(
    (a) =>
      a.facilitatorId === currentUser?.id &&
      a.date === today &&
      !db.psr.some((p) => p.attendanceId === a.id)
  );

  const hasAttendanceToday = db.attendance.some(
    (a) => a.facilitatorId === currentUser?.id && a.date === today
  );

  // Open on whichever tab has something to do.
  const [tab, setTab] = useState(pendingCheckIns.length > 0 ? 'checkins' : 'manual');
  const [beneficiaryId, setBeneficiaryId] = useState(db.beneficiaries[0]?.id);
  const manual = useSessionFields();

  const mySessions = db.psr
    .filter((p) => p.facilitatorId === currentUser?.id)
    .slice()
    .reverse();

  async function submitManual() {
    if (!hasAttendanceToday) {
      Alert.alert('No attendance today', 'Mark attendance on the Attendance screen before logging a session.');
      return;
    }
    if (!beneficiaryId) {
      Alert.alert('Beneficiary required', 'Select a beneficiary.');
      return;
    }
    const problem = validateSession(manual, today);
    if (problem) return Alert.alert(problem[0], problem[1]);
    try {
      await addRecord('psr', {
        id: nextId('PSR', 'psr'),
        beneficiaryId,
        facilitatorId: currentUser.id,
        date: today,
        ...toPsrFields(manual),
      });
      Alert.alert('Saved', 'Session record submitted.');
      manual.reset();
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    }
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.lg }}>
          Post-Session Record
        </Text>

        <Segmented
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'checkins', label: "Today's check-ins", count: pendingCheckIns.length },
            { key: 'manual', label: 'Add manually' },
          ]}
        />

        {tab === 'checkins' && (
          <>
            {pendingCheckIns.length === 0 ? (
              <Card>
                <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 4 }}>You're all caught up</Text>
                <Text style={{ color: colors.textMuted }}>
                  No check-ins are waiting for a session record. When you time in on the Attendance screen, the
                  visit will show up here to complete.
                </Text>
              </Card>
            ) : (
              pendingCheckIns.map((a) => <CompleteCheckIn key={a.id} attendanceRecord={a} />)
            )}
          </>
        )}

        {tab === 'manual' && (
          <>
            {!hasAttendanceToday ? (
              <Card>
                <Text style={{ color: colors.textMuted }}>
                  You haven't marked attendance today. Check in on the Attendance screen first -- a session record
                  can't be logged for a day with no attendance behind it.
                </Text>
              </Card>
            ) : (
              <Card>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>
                  For a visit that isn't in your check-ins. Anything you checked in for should be completed from
                  the Today's check-ins tab instead.
                </Text>
                <SessionFields
                  f={manual}
                  date={today}
                  beneficiaryPicker={
                    <Select
                      label="Beneficiary (required)"
                      value={beneficiaryId}
                      onSelect={setBeneficiaryId}
                      options={db.beneficiaries.map((b) => ({
                        value: b.id,
                        label: `${b.school} - ${b.class}${b.section ? ' ' + b.section : ''}`,
                      }))}
                    />
                  }
                />
                <PrimaryButton title="Submit session record" onPress={submitManual} />
              </Card>
            )}
          </>
        )}

        <SectionLabel>Recent submissions</SectionLabel>
        {mySessions.length === 0 && (
          <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>No session records yet.</Text>
        )}
        {mySessions.slice(0, 5).map((p) => {
          const b = db.beneficiaries.find((x) => x.id === p.beneficiaryId);
          return (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontWeight: '700', color: colors.text, flex: 1, marginRight: spacing.sm }}>
                  {b?.school}
                  {b?.class ? ` - ${b.class}${b.section ? ' ' + b.section : ''}` : ''}
                </Text>
                <RagChip rag={p.rag} />
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {p.date} - {p.studentsPresent} students - {p.rating}
              </Text>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
