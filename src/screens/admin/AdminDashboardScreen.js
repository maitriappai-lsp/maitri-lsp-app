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
import { Screen, Card, Field, Chip, RagChip, PrimaryButton, SecondaryButton, Select } from '../../components/UI';
import { colors, spacing } from '../../theme';

const TABS = ['Overview', 'Attendance', 'Sessions', 'Uploads'];
const RAG_FILTERS = ['All', 'Green', 'Amber', 'Red'];

export default function AdminDashboardScreen() {
  const { db, deleteRecord, updateRecord } = useData();
  const [tab, setTab] = useState('Overview');
  const [ragFilter, setRagFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('2026-09-01');
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
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
          <Field label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" />
        </View>
      </View>

      <Select
        label="Facilitator"
        value={facilitatorId}
        onSelect={setFacilitatorId}
        options={[{ value: 'all', label: 'All resources' }, ...facilitators.map((f) => ({ value: f.id, label: f.name }))]}
      />

      <Card>
        <Text style={{ fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>
          Summary -- {from} to {to}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <View style={{ minWidth: 130 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{summary.daysPresent}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Days present</Text>
          </View>
          <View style={{ minWidth: 130 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{summary.attendanceRecords}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Attendance records</Text>
          </View>
          <View style={{ minWidth: 130 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{summary.sessionRecords}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Session records</Text>
          </View>
          <View style={{ minWidth: 130 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{summary.fileUploads}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>File uploads</Text>
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

      <ScrollView showsVerticalScrollIndicator={false}>
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
                      <Text style={{ color: colors.text, fontSize: 13 }}>Students present: {p.studentsPresent}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Rating: {p.rating}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Facilitator feedback: {p.facilitatorFeedback || '-'}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>School feedback: {p.schoolFeedback || '-'}</Text>
                      <TouchableOpacity
                        onPress={() =>
                          Alert.alert('Delete record', 'Remove this PSR record?', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('psr', p.id) },
                          ])
                        }
                        style={{ marginTop: spacing.sm }}
                      >
                        <Text style={{ color: colors.red, fontWeight: '700' }}>Delete this record</Text>
                      </TouchableOpacity>
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
                      <Field label="Date" value={editDate} onChangeText={setEditDate} placeholder="YYYY-MM-DD" />
                      <View style={{ flexDirection: 'row', gap: spacing.md }}>
                        <View style={{ flex: 1 }}>
                          <Field label="Time in" value={editTimeIn} onChangeText={setEditTimeIn} placeholder="10:02 AM" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Field label="Time out" value={editTimeOut} onChangeText={setEditTimeOut} placeholder="10:58 AM" />
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
                          onPress={() =>
                            Alert.alert('Delete record', 'Remove this attendance record?', [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('attendance', a.id) },
                            ])
                          }
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
