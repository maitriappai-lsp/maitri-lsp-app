// SCREEN 3 (Facilitator): Sessions (Post-Session Record).
// Single flat form per spec decision (no header/detail split), current
// academic-year only, no future dates.
//
// Attendance's Time In creates a row in the separate `attendance` table
// (check-in/check-out, geofence/face verification, ad-hoc flag) -- this
// screen's job is the session-quality side: category, rating, feedback.
// "Complete today's check-ins" lists attendance rows for today that don't
// have a linked PSR yet, and saving one here creates that PSR record,
// linked back to the attendance row via attendanceId. The form further
// down still lets you create a session record from scratch for anything
// that didn't go through Attendance at all.
import React, { useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { Screen, Card, SectionLabel, Field, Select, PrimaryButton, SecondaryButton, RagChip } from '../../components/UI';
import { colors, spacing } from '../../theme';

const RATINGS = ['Excellent', 'Good', 'Needs follow-up'];
const RAGS = ['Green', 'Amber', 'Red'];

function CompleteCheckIn({ attendanceRecord }) {
  const { db, addRecord, nextId } = useData();
  const beneficiary = db.beneficiaries.find((b) => b.id === attendanceRecord.beneficiaryId);
  const [categoryId, setCategoryId] = useState(db.categories[0]?.id);
  const [studentsPresent, setStudentsPresent] = useState('');
  const [rating, setRating] = useState('Good');
  const [rag, setRag] = useState('Green');
  const [facilitatorFeedback, setFacilitatorFeedback] = useState('');
  const [schoolFeedback, setSchoolFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await addRecord('psr', {
        id: nextId('PSR', 'psr'),
        beneficiaryId: attendanceRecord.beneficiaryId,
        facilitatorId: attendanceRecord.facilitatorId,
        date: attendanceRecord.date,
        timeIn: attendanceRecord.timeIn,
        timeOut: attendanceRecord.timeOut,
        attendanceId: attendanceRecord.id,
        categoryId,
        studentsPresent: Number(studentsPresent) || 0,
        rating,
        rag,
        facilitatorFeedback,
        schoolFeedback,
        photosUploaded: false,
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
      <SectionLabel>
        {beneficiary?.school} {beneficiary?.class} {beneficiary?.section} -- {attendanceRecord.timeIn}
        {attendanceRecord.timeOut ? ` to ${attendanceRecord.timeOut}` : ' (time out not marked yet)'}
      </SectionLabel>
      {attendanceRecord.adHoc && (
        <Text style={{ color: colors.amber, fontSize: 12, marginBottom: spacing.sm }}>
          Ad-hoc visit -- not on the day's schedule.
        </Text>
      )}
      <SectionLabel>Life skill service category</SectionLabel>
      <Select
        value={categoryId}
        onSelect={setCategoryId}
        options={db.categories.map((c) => ({
          value: c.id,
          label: `${c.pillar} / ${c.topic}${c.subtopic !== 'OTHERS' ? ' / ' + c.subtopic : ''}`,
        }))}
      />
      <Field
        label="Students present"
        value={studentsPresent}
        onChangeText={setStudentsPresent}
        keyboardType="number-pad"
        placeholder="28"
      />
      <SectionLabel>Rating (session quality)</SectionLabel>
      <Select value={rating} onSelect={setRating} options={RATINGS.map((r) => ({ value: r, label: r }))} />
      <SectionLabel>RAG status</SectionLabel>
      <Select value={rag} onSelect={setRag} options={RAGS.map((r) => ({ value: r, label: r }))} />
      <Field
        label="Facilitator feedback"
        value={facilitatorFeedback}
        onChangeText={setFacilitatorFeedback}
        placeholder="What went well / what didn't"
        multiline
      />
      <Field
        label="School feedback"
        value={schoolFeedback}
        onChangeText={setSchoolFeedback}
        placeholder="Any feedback from the school"
        multiline
      />
      <PrimaryButton title={saving ? 'Saving...' : 'Save session details'} onPress={save} disabled={saving} />
    </Card>
  );
}

export default function SessionsScreen() {
  const { currentUser } = useAuth();
  const { db, addRecord, nextId } = useData();
  const today = new Date().toISOString().slice(0, 10);

  const pendingCheckIns = db.attendance.filter(
    (a) =>
      a.facilitatorId === currentUser?.id &&
      a.date === today &&
      !db.psr.some((p) => p.attendanceId === a.id)
  );

  const hasAttendanceToday = db.attendance.some(
    (a) => a.facilitatorId === currentUser?.id && a.date === today
  );

  const [beneficiaryId, setBeneficiaryId] = useState(db.beneficiaries[0]?.id);
  const [categoryId, setCategoryId] = useState(db.categories[0]?.id);
  const [studentsPresent, setStudentsPresent] = useState('');
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
  const [rating, setRating] = useState('Good');
  const [rag, setRag] = useState('Green');
  const [facilitatorFeedback, setFacilitatorFeedback] = useState('');
  const [schoolFeedback, setSchoolFeedback] = useState('');

  const mySessions = db.psr
    .filter((p) => p.facilitatorId === currentUser?.id)
    .slice()
    .reverse();

  async function submit() {
    if (!hasAttendanceToday) {
      Alert.alert('No attendance today', 'Mark attendance on the Attendance screen before logging a session.');
      return;
    }
    const record = {
      id: nextId('PSR', 'psr'),
      beneficiaryId,
      facilitatorId: currentUser.id,
      date: today,
      timeIn,
      timeOut,
      categoryId,
      studentsPresent: Number(studentsPresent) || 0,
      rating,
      rag,
      facilitatorFeedback,
      schoolFeedback,
      photosUploaded: false,
    };
    try {
      await addRecord('psr', record);
      Alert.alert('Saved', 'Session record submitted.');
      setStudentsPresent('');
      setTimeIn('');
      setTimeOut('');
      setFacilitatorFeedback('');
      setSchoolFeedback('');
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    }
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.lg }}>
          Post-Session Record
        </Text>

        {pendingCheckIns.length > 0 && (
          <>
            <SectionLabel>Complete today's check-ins</SectionLabel>
            {pendingCheckIns.map((a) => (
              <CompleteCheckIn key={a.id} attendanceRecord={a} />
            ))}
          </>
        )}

        <SectionLabel>Or create a session record from scratch</SectionLabel>
        {!hasAttendanceToday ? (
          <Card>
            <Text style={{ color: colors.textMuted }}>
              You haven't marked attendance today. Check in on the Attendance screen first -- a session record
              can't be logged for a day with no attendance behind it.
            </Text>
          </Card>
        ) : (
        <Card>
          <SectionLabel>Beneficiary</SectionLabel>
          <Select
            value={beneficiaryId}
            onSelect={setBeneficiaryId}
            options={db.beneficiaries.map((b) => ({
              value: b.id,
              label: `${b.school} - ${b.class}${b.section ? ' ' + b.section : ''}`,
            }))}
          />

          <SectionLabel>Life skill service category</SectionLabel>
          <Select
            value={categoryId}
            onSelect={setCategoryId}
            options={db.categories.map((c) => ({
              value: c.id,
              label: `${c.pillar} / ${c.topic}${c.subtopic !== 'OTHERS' ? ' / ' + c.subtopic : ''}`,
            }))}
          />

          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Time in" value={timeIn} onChangeText={setTimeIn} placeholder="10:02 AM" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Time out" value={timeOut} onChangeText={setTimeOut} placeholder="10:58 AM" />
            </View>
          </View>

          <Field
            label="Students present"
            value={studentsPresent}
            onChangeText={setStudentsPresent}
            keyboardType="number-pad"
            placeholder="28"
          />

          <SectionLabel>Rating (session quality)</SectionLabel>
          <Select value={rating} onSelect={setRating} options={RATINGS.map((r) => ({ value: r, label: r }))} />

          <SectionLabel>RAG status</SectionLabel>
          <Select value={rag} onSelect={setRag} options={RAGS.map((r) => ({ value: r, label: r }))} />

          <Field
            label="Facilitator feedback"
            value={facilitatorFeedback}
            onChangeText={setFacilitatorFeedback}
            placeholder="What went well / what didn't"
            multiline
          />
          <Field
            label="School feedback"
            value={schoolFeedback}
            onChangeText={setSchoolFeedback}
            placeholder="Any feedback from the school"
            multiline
          />

          <PrimaryButton title="Submit session record" onPress={submit} />
        </Card>
        )}

        <SectionLabel>Recent submissions this session</SectionLabel>
        {mySessions.slice(0, 5).map((p) => {
          const b = db.beneficiaries.find((x) => x.id === p.beneficiaryId);
          return (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{b?.school}</Text>
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
