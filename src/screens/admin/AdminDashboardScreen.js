// SCREEN 5 (Admin): Dashboard.
// Same shape as the Facilitator dashboard, plus a facilitator filter (view
// one facilitator's activity or all pooled together) and Edit/Delete rights
// on any PSR/attendance/upload record from the drill-down.
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useData } from '../../data/store';
import { apiGet } from '../../data/api';
import { Screen, Card, Field, Chip, RagChip, PrimaryButton, SecondaryButton, Select, DateField, TimeField } from '../../components/UI';
import { colors, spacing } from '../../theme';
import { todayLocalYMD } from '../../utils/date';
import { isFutureTime } from '../../utils/date';

const TABS = ['Overview', 'Attendance', 'Sessions', 'Uploads'];
const RAG_FILTERS = ['All', 'Green', 'Amber', 'Red'];
const RATINGS = ['Excellent', 'Good', 'Needs follow-up'];
const RAGS = ['Green', 'Amber', 'Red'];

export default function AdminDashboardScreen() {
  const { db, deleteRecord, updateRecord } = useData();
  const [tab, setTab] = useState('Overview');
  const [ragFilter, setRagFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('2026-09-01');
  const [to, setTo] = useState(todayLocalYMD());
  const [facilitatorId, setFacilitatorId] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const [editingAttendanceId, setEditingAttendanceId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editTimeIn, setEditTimeIn] = useState('');
  const [editTimeOut, setEditTimeOut] = useState('');
  const [editBeneficiaryId, setEditBeneficiaryId] = useState(null);
  const [editGeoVerified, setEditGeoVerified] = useState('true');
  const [editAdHoc, setEditAdHoc] = useState('false');
  const [savingAttendance, setSavingAttendance] = useState(false);

  function startEditAttendance(a) {
    setEditingAttendanceId(a.id);
    setEditDate(a.date || '');
    setEditTimeIn(a.timeIn || '');
    setEditTimeOut(a.timeOut || '');
    setEditBeneficiaryId(a.beneficiaryId);
    setEditGeoVerified(a.geoVerified ? 'true' : 'false');
    setEditAdHoc(a.adHoc ? 'true' : 'false');
  }

  function cancelEditAttendance() {
    setEditingAttendanceId(null);
  }

  async function saveEditAttendance() {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(editDate)) {
      return Alert.alert('Invalid date', 'Date should be in YYYY-MM-DD format, e.g. 2026-09-19.');
    }
    if (editDate > todayLocalYMD()) {
      return Alert.alert('Date is in the future', 'Attendance can only be dated today or earlier.');
    }
    setSavingAttendance(true);
    try {
      await updateRecord('attendance', editingAttendanceId, {
        date: editDate,
        timeIn: editTimeIn,
        timeOut: editTimeOut,
        beneficiaryId: editBeneficiaryId,
        geoVerified: editGeoVerified === 'true',
        adHoc: editAdHoc === 'true',
      });
      setEditingAttendanceId(null);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSavingAttendance(false);
    }
  }

  // ---- Edit a session (PSR) record ----------------------------------------
  const [editingPsrId, setEditingPsrId] = useState(null);
  const [editPsrBeneficiaryId, setEditPsrBeneficiaryId] = useState(null);
  const [editPsrDate, setEditPsrDate] = useState('');
  const [editPsrCategoryId, setEditPsrCategoryId] = useState(null);
  const [editPsrTimeIn, setEditPsrTimeIn] = useState('');
  const [editPsrTimeOut, setEditPsrTimeOut] = useState('');
  const [editPsrStudents, setEditPsrStudents] = useState('');
  const [editPsrRating, setEditPsrRating] = useState('Good');
  const [editPsrRag, setEditPsrRag] = useState('Green');
  const [editPsrFacilitatorFeedback, setEditPsrFacilitatorFeedback] = useState('');
  const [editPsrSchoolFeedback, setEditPsrSchoolFeedback] = useState('');
  const [editPsrExternalOrgName, setEditPsrExternalOrgName] = useState('');
  const [editPsrExternalResources, setEditPsrExternalResources] = useState('');
  const [editPsrPhotosUploaded, setEditPsrPhotosUploaded] = useState(false);
  const [savingPsr, setSavingPsr] = useState(false);

  function startEditPsr(p) {
    setEditingPsrId(p.id);
    setEditPsrBeneficiaryId(p.beneficiaryId);
    setEditPsrDate(p.date);
    setEditPsrCategoryId(p.categoryId);
    setEditPsrTimeIn(p.timeIn || '');
    setEditPsrTimeOut(p.timeOut || '');
    setEditPsrStudents(String(p.studentsPresent ?? ''));
    setEditPsrRating(p.rating || 'Good');
    setEditPsrRag(p.rag || 'Green');
    setEditPsrFacilitatorFeedback(p.facilitatorFeedback || '');
    setEditPsrSchoolFeedback(p.schoolFeedback || '');
    setEditPsrExternalOrgName(p.externalOrgName || '');
    setEditPsrExternalResources(p.externalResources || '');
    setEditPsrPhotosUploaded(!!p.photosUploaded);
  }

  async function saveEditPsr(psr) {
    if (!editPsrBeneficiaryId) return Alert.alert('Beneficiary required', 'Select a beneficiary.');
    if (!editPsrDate) return Alert.alert('Date required', 'Pick a date.');
    if (editPsrDate > todayLocalYMD()) {
      return Alert.alert('Date is in the future', 'A session cannot be dated after today.');
    }
    if (!editPsrCategoryId) return Alert.alert('Category required', 'Select a life skill service category.');
    if (!editPsrTimeIn.trim() || !editPsrTimeOut.trim()) {
      return Alert.alert('Time required', 'Time in and time out are both required.');
    }
    if (isFutureTime(editPsrDate, editPsrTimeIn) || isFutureTime(editPsrDate, editPsrTimeOut)) {
      return Alert.alert('Time is in the future', 'Time in and time out cannot be later than the current time.');
    }
    if (editPsrTimeOut <= editPsrTimeIn) {
      return Alert.alert('Check the times', 'Time out must be later than time in.');
    }

    // A session must always sit on top of a real check-in. If the date
    // and/or beneficiary changed, re-find the attendance record it should
    // now be linked to, rather than leaving the old link pointing at a
    // record for a different day/beneficiary.
    const matchingAttendance = db.attendance.find(
      (a) =>
        a.facilitatorId === psr.facilitatorId &&
        a.beneficiaryId === editPsrBeneficiaryId &&
        a.date === editPsrDate
    );
    if (!matchingAttendance) {
      const b = db.beneficiaries.find((x) => x.id === editPsrBeneficiaryId);
      Alert.alert(
        'No matching attendance record',
        `${b?.school || 'This beneficiary'} has no attendance record for ${psr.facilitatorId ? db.resources.find((r) => r.id === psr.facilitatorId)?.name : 'this facilitator'} on ${editPsrDate}. Create or correct that attendance record first (Attendance tab, or Attendance Override), then edit this session again.`
      );
      return;
    }

    setSavingPsr(true);
    try {
      await updateRecord('psr', editingPsrId, {
        beneficiaryId: editPsrBeneficiaryId,
        date: editPsrDate,
        attendanceId: matchingAttendance.id,
        categoryId: editPsrCategoryId,
        timeIn: editPsrTimeIn,
        timeOut: editPsrTimeOut,
        studentsPresent: Number(editPsrStudents) || 0,
        rating: editPsrRating,
        rag: editPsrRag,
        facilitatorFeedback: editPsrFacilitatorFeedback,
        schoolFeedback: editPsrSchoolFeedback,
        externalOrgName: editPsrExternalOrgName || null,
        externalResources: editPsrExternalResources || null,
        photosUploaded: editPsrPhotosUploaded,
      });
      setEditingPsrId(null);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSavingPsr(false);
    }
  }

  const facilitators = db.resources.filter((r) => r.role === 'Facilitator');

  const sessions = useMemo(
    () =>
      db.psr
        .filter((p) => (facilitatorId === 'all' ? true : p.facilitatorId === facilitatorId))
        .filter((p) => p.date >= from && p.date <= to)
        .filter((p) => ragFilter === 'All' || p.rag === ragFilter)
        .filter((p) => {
          if (!query) return true;
          const b = db.beneficiaries.find((x) => x.id === p.beneficiaryId);
          const cat = db.categories.find((x) => x.id === p.categoryId);
          const haystack = `${b?.school} ${cat?.pillar} ${p.facilitatorFeedback} ${p.schoolFeedback} ${p.rag}`.toLowerCase();
          return haystack.includes(query.toLowerCase());
        }),
    [db, facilitatorId, from, to, ragFilter, query]
  );

  const attendance = useMemo(
    () =>
      db.attendance
        .filter((a) => (facilitatorId === 'all' ? true : a.facilitatorId === facilitatorId))
        .filter((a) => a.date >= from && a.date <= to),
    [db, facilitatorId, from, to]
  );

  const uploads = db.uploads.filter(
    (u) => (facilitatorId === 'all' ? true : u.facilitatorId === facilitatorId) && u.date >= from && u.date <= to
  );

  const [exporting, setExporting] = useState(false);

  async function exportToExcel() {
    const exportType = tab === 'Attendance' ? 'attendance' : tab === 'Uploads' ? 'uploads' : 'sessions';
    setExporting(true);
    try {
      const params = new URLSearchParams({ from, to, facilitatorId });
      const { filename, base64 } = await apiGet(`/api/export/${exportType}?${params.toString()}`);
      const fileUri = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: filename,
        });
      } else {
        Alert.alert('Saved', `File saved to ${fileUri}, but sharing isn't available on this device.`);
      }
    } catch (e) {
      Alert.alert('Export failed', e.message || 'Please try again.');
    } finally {
      setExporting(false);
    }
  }

  const summary = useMemo(
    () => ({
      daysPresent: new Set(attendance.map((a) => a.date)).size,
      attendanceRecords: attendance.length,
      sessionRecords: sessions.length,
      fileUploads: uploads.length,
    }),
    [attendance, sessions, uploads]
  );

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md }}>
        Programme overview
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <DateField label="From" value={from} onChange={setFrom} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="To" value={to} onChange={setTo} />
        </View>
      </View>

      <Select
        label="Facilitator"
        value={facilitatorId}
        onSelect={setFacilitatorId}
        options={[{ value: 'all', label: 'All resources' }, ...facilitators.map((f) => ({ value: f.id, label: f.name }))]}
      />

      <Card style={{ paddingVertical: spacing.sm }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{summary.daysPresent}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>Days</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{summary.attendanceRecords}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>Attend</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{summary.sessionRecords}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>Sessions</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{summary.fileUploads}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>Files</Text>
          </View>
        </View>
      </Card>

      <Field
        label="Search remarks, feedback, RAG, beneficiary or category"
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. empathy, red, Canal road"
      />

      <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
        {TABS.map((t) => (
          <Chip key={t} label={t} active={tab === t} onPress={() => setTab(t)} />
        ))}
      </View>

      {tab === 'Sessions' && (
        <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
          {RAG_FILTERS.map((r) => (
            <Chip key={r} label={r} active={ragFilter === r} onPress={() => setRagFilter(r)} />
          ))}
        </View>
      )}

      <SecondaryButton
        title={exporting ? 'Exporting...' : `Export ${tab === 'Attendance' ? 'attendance' : tab === 'Uploads' ? 'uploads' : 'sessions'} to Excel`}
        onPress={exportToExcel}
        disabled={exporting}
        style={{ marginBottom: spacing.md }}
      />

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tab === 'Overview' && (
          <Card>
            <Text style={{ fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>
              RAG breakdown ({sessions.length} session record{sessions.length === 1 ? '' : 's'})
            </Text>
            {['Green', 'Amber', 'Red'].map((r) => {
              const count = sessions.filter((p) => p.rag === r).length;
              return (
                <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                  <RagChip rag={r} />
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{count}</Text>
                </View>
              );
            })}
            <Text style={{ fontWeight: '700', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm }}>
              Sessions by pillar
            </Text>
            {Object.entries(
              sessions.reduce((acc, p) => {
                const cat = db.categories.find((x) => x.id === p.categoryId);
                const pillar = cat?.pillar || 'Uncategorised';
                acc[pillar] = (acc[pillar] || 0) + 1;
                return acc;
              }, {})
            ).map(([pillar, count]) => (
              <View key={pillar} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                <Text style={{ color: colors.textMuted }}>{pillar}</Text>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{count}</Text>
              </View>
            ))}
          </Card>
        )}

        {tab === 'Sessions' &&
          sessions.map((p) => {
            const b = db.beneficiaries.find((x) => x.id === p.beneficiaryId);
            const f = db.resources.find((x) => x.id === p.facilitatorId);
            const cat = db.categories.find((x) => x.id === p.categoryId);
            const isOpen = expandedId === p.id;

            if (editingPsrId === p.id) {
              return (
                <Card key={p.id}>
                  <Text style={{ fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>
                    Editing session -- {b?.school}
                  </Text>
                  <Select
                    label="Beneficiary"
                    value={editPsrBeneficiaryId}
                    onSelect={setEditPsrBeneficiaryId}
                    options={db.beneficiaries.map((x) => ({
                      value: x.id,
                      label: `${x.school} - ${x.class}${x.section ? ' ' + x.section : ''}`,
                    }))}
                  />
                  <DateField label="Date" value={editPsrDate} onChange={setEditPsrDate} maximumDate={new Date()} />
                  <Select
                    label="Life skill service category"
                    value={editPsrCategoryId}
                    onSelect={setEditPsrCategoryId}
                    options={db.categories.map((c) => ({
                      value: c.id,
                      label: `${c.pillar} / ${c.topic}${c.subtopic !== 'OTHERS' ? ' / ' + c.subtopic : ''}`,
                    }))}
                  />
                  <View style={{ flexDirection: 'row', gap: spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <TimeField
                        label="Time in"
                        value={editPsrTimeIn}
                        onChange={setEditPsrTimeIn}
                        blockFutureOn={editPsrDate === todayLocalYMD() ? editPsrDate : undefined}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TimeField
                        label="Time out"
                        value={editPsrTimeOut}
                        onChange={setEditPsrTimeOut}
                        blockFutureOn={editPsrDate === todayLocalYMD() ? editPsrDate : undefined}
                      />
                    </View>
                  </View>
                  <Field
                    label="Students present"
                    value={editPsrStudents}
                    onChangeText={setEditPsrStudents}
                    keyboardType="number-pad"
                  />
                  <Select
                    label="Rating"
                    value={editPsrRating}
                    onSelect={setEditPsrRating}
                    options={RATINGS.map((r) => ({ value: r, label: r }))}
                  />
                  <Select
                    label="RAG status"
                    value={editPsrRag}
                    onSelect={setEditPsrRag}
                    options={RAGS.map((r) => ({ value: r, label: r }))}
                  />
                  <Field
                    label="Facilitator feedback"
                    value={editPsrFacilitatorFeedback}
                    onChangeText={setEditPsrFacilitatorFeedback}
                    multiline
                  />
                  <Field
                    label="School feedback"
                    value={editPsrSchoolFeedback}
                    onChangeText={setEditPsrSchoolFeedback}
                    multiline
                  />
                  <Field
                    label="External org name"
                    value={editPsrExternalOrgName}
                    onChangeText={setEditPsrExternalOrgName}
                    placeholder="e.g. a partner NGO involved in this session"
                  />
                  <Field
                    label="External resources"
                    value={editPsrExternalResources}
                    onChangeText={setEditPsrExternalResources}
                    placeholder="e.g. materials or resources an external org provided"
                    multiline
                  />
                  <SectionLabel>Photos taken and shared</SectionLabel>
                  <Select
                    value={editPsrPhotosUploaded ? 'yes' : 'no'}
                    onSelect={(v) => setEditPsrPhotosUploaded(v === 'yes')}
                    options={[
                      { value: 'no', label: 'No' },
                      { value: 'yes', label: 'Yes' },
                    ]}
                  />
                  <PrimaryButton
                    title={savingPsr ? 'Saving...' : 'Save changes'}
                    onPress={() => saveEditPsr(p)}
                    disabled={savingPsr}
                  />
                  <SecondaryButton title="Cancel" onPress={() => setEditingPsrId(null)} style={{ marginTop: spacing.sm }} />
                </Card>
              );
            }

            return (
              <TouchableOpacity key={p.id} onPress={() => setExpandedId(isOpen ? null : p.id)}>
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{b?.school}</Text>
                    <RagChip rag={p.rag} />
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {f?.name} - {p.date} - {cat?.pillar}
                  </Text>
                  {isOpen && (
                    <View style={{ marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Time in: {p.timeIn || '--'}   Time out: {p.timeOut || '--'}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Students present: {p.studentsPresent}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Rating: {p.rating}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Facilitator feedback: {p.facilitatorFeedback || '-'}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>School feedback: {p.schoolFeedback || '-'}</Text>
                      <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm }}>
                        <TouchableOpacity onPress={() => startEditPsr(p)}>
                          <Text style={{ color: colors.primary, fontWeight: '700' }}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            Alert.alert('Delete record', 'Remove this PSR record?', [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('psr', p.id) },
                            ])
                          }
                        >
                          <Text style={{ color: colors.red, fontWeight: '700' }}>Delete this record</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </Card>
              </TouchableOpacity>
            );
          })}

        {tab === 'Uploads' &&
          uploads.map((u) => {
            const b = db.beneficiaries.find((x) => x.id === u.beneficiaryId);
            const f = db.resources.find((x) => x.id === u.facilitatorId);
            return (
              <Card key={u.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, paddingRight: spacing.md }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{u.fileName}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      {f?.name} - {b?.school} - {u.date}
                    </Text>
                  </View>
                  {u.fileUrl ? (
                    <TouchableOpacity onPress={() => Linking.openURL(u.fileUrl)}>
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>View</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>No file</Text>
                  )}
                </View>
              </Card>
            );
          })}

        {tab === 'Attendance' &&
          (attendance.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>No attendance records for this range.</Text>
          ) : (
            attendance
              .slice()
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((a) => {
                const b = db.beneficiaries.find((x) => x.id === a.beneficiaryId);
                const f = db.resources.find((x) => x.id === a.facilitatorId);

                if (editingAttendanceId === a.id) {
                  return (
                    <Card key={a.id}>
                      <Text style={{ fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>
                        Editing attendance -- {f?.name}
                      </Text>
                      <DateField label="Date" value={editDate} onChange={setEditDate} maximumDate={new Date()} />
                      <View style={{ flexDirection: 'row', gap: spacing.md }}>
                        <View style={{ flex: 1 }}>
                          <TimeField
                            label="Time in"
                            value={editTimeIn}
                            onChange={setEditTimeIn}
                            blockFutureOn={editDate === todayLocalYMD() ? editDate : undefined}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <TimeField
                            label="Time out"
                            value={editTimeOut}
                            onChange={setEditTimeOut}
                            blockFutureOn={editDate === todayLocalYMD() ? editDate : undefined}
                          />
                        </View>
                      </View>
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
                        label="Geofence verified"
                        value={editGeoVerified}
                        onSelect={setEditGeoVerified}
                        options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                      />
                      <Select
                        label="Ad-hoc (not on that day's schedule)"
                        value={editAdHoc}
                        onSelect={setEditAdHoc}
                        options={[{ value: 'false', label: 'No -- was scheduled' }, { value: 'true', label: 'Yes -- ad-hoc' }]}
                      />
                      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <PrimaryButton
                            title={savingAttendance ? 'Saving...' : 'Save'}
                            onPress={saveEditAttendance}
                            disabled={savingAttendance}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <SecondaryButton title="Cancel" onPress={cancelEditAttendance} />
                        </View>
                      </View>
                    </Card>
                  );
                }

                return (
                  <Card key={a.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '700', color: colors.text }}>{f?.name}</Text>
                      {a.adHoc && (
                        <Text style={{ color: colors.amber, fontSize: 12, fontWeight: '700' }}>Ad-hoc</Text>
                      )}
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      {a.date} - {b?.school} {b?.class} {b?.section}
                    </Text>
                    <Text style={{ color: colors.text, fontSize: 13 }}>
                      Time in: {a.timeIn || '--'}   Time out: {a.timeOut || '--'}
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {a.geoVerified ? 'Geofence verified' : 'Not geofence-verified'}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: spacing.md }}>
                        <TouchableOpacity onPress={() => startEditAttendance(a)}>
                          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            const linkedSessions = db.psr.filter((p) => p.attendanceId === a.id);
                            if (linkedSessions.length > 0) {
                              Alert.alert(
                                'Cannot delete',
                                `${linkedSessions.length} session record(s) are linked to this attendance record. Delete those first (Sessions tab), then delete this attendance record.`
                              );
                              return;
                            }
                            Alert.alert('Delete record', 'Remove this attendance record?', [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('attendance', a.id) },
                            ]);
                          }}
                        >
                          <Text style={{ color: colors.red, fontWeight: '700', fontSize: 12 }}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Card>
                );
              })
          ))}
      </ScrollView>
    </Screen>
  );
}
