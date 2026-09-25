// SCREEN 5 (Facilitator): Dashboard.
// Date range + search + sub-tabs (Overview/Attendance/Sessions/Uploads) +
// RAG quick filters + tap-to-drill-down + Export to Excel (stubbed --
// wire to a server-side exceljs endpoint per Section 6 when the backend
// exists; client-side you could also use a library like react-native-xlsx).
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { apiGet } from '../../data/api';
import { Screen, Card, Field, Chip, RagChip, SecondaryButton, DateField } from '../../components/UI';
import { colors, spacing } from '../../theme';

const TABS = ['Overview', 'Attendance', 'Sessions', 'Uploads'];
const RAG_FILTERS = ['All', 'Green', 'Amber', 'Red'];

export default function DashboardScreen() {
  const { currentUser } = useAuth();
  const { db } = useData();
  const [tab, setTab] = useState('Overview');
  const [ragFilter, setRagFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('2026-09-01');
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [expandedId, setExpandedId] = useState(null);

  const mySessions = useMemo(
    () =>
      db.psr
        .filter((p) => p.facilitatorId === currentUser?.id)
        .filter((p) => p.date >= from && p.date <= to)
        .filter((p) => ragFilter === 'All' || p.rag === ragFilter)
        .filter((p) => {
          if (!query) return true;
          const b = db.beneficiaries.find((x) => x.id === p.beneficiaryId);
          const cat = db.categories.find((x) => x.id === p.categoryId);
          const haystack = `${b?.school} ${cat?.pillar} ${p.facilitatorFeedback} ${p.schoolFeedback} ${p.rag}`.toLowerCase();
          return haystack.includes(query.toLowerCase());
        }),
    [db, currentUser, from, to, ragFilter, query]
  );

  const myAttendance = useMemo(
    () =>
      db.attendance
        .filter((a) => a.facilitatorId === currentUser?.id)
        .filter((a) => a.date >= from && a.date <= to),
    [db, currentUser, from, to]
  );

  const myUploads = db.uploads.filter(
    (u) => u.facilitatorId === currentUser?.id && u.date >= from && u.date <= to
  );

  const [exporting, setExporting] = useState(false);

  async function exportToExcel() {
    const exportType = tab === 'Attendance' ? 'attendance' : tab === 'Uploads' ? 'uploads' : 'sessions';
    setExporting(true);
    try {
      const { filename, base64 } = await apiGet(
        `/api/export/${exportType}?from=${from}&to=${to}&facilitatorId=${currentUser.id}`
      );
      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: filename,
        });
      } else {
        Alert.alert('Export ready', `Saved to ${fileUri}`);
      }
    } catch (e) {
      Alert.alert('Export failed', e.message || 'Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md }}>
        My activity
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <DateField label="From" value={from} onChange={setFrom} />
        </View>
        <View style={{ flex: 1 }}>
          <DateField label="To" value={to} onChange={setTo} />
        </View>
      </View>
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
            <Chip
              key={r}
              label={r}
              active={ragFilter === r}
              onPress={() => setRagFilter(r)}
              color={r === 'Green' ? colors.green : r === 'Amber' ? colors.amber : r === 'Red' ? colors.red : undefined}
            />
          ))}
        </View>
      )}

      <SecondaryButton
        title={exporting ? 'Exporting...' : 'Export to Excel'}
        onPress={exportToExcel}
        disabled={exporting}
        style={{ marginBottom: spacing.md }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {(tab === 'Overview' || tab === 'Sessions') &&
          mySessions.map((p) => {
            const b = db.beneficiaries.find((x) => x.id === p.beneficiaryId);
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
                    {p.date} - {cat?.pillar} - {cat?.topic}
                  </Text>
                  {isOpen && (
                    <View style={{ marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Students present: {p.studentsPresent}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Rating: {p.rating}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Time: {p.timeIn} - {p.timeOut}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Facilitator feedback: {p.facilitatorFeedback || '-'}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>School feedback: {p.schoolFeedback || '-'}</Text>
                    </View>
                  )}
                </Card>
              </TouchableOpacity>
            );
          })}

        {tab === 'Uploads' &&
          myUploads.map((u) => (
            <Card key={u.id}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{u.fileName}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{u.date}</Text>
            </Card>
          ))}

        {tab === 'Attendance' &&
          (myAttendance.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>No attendance records for this range.</Text>
          ) : (
            myAttendance
              .slice()
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((a) => {
                const b = db.beneficiaries.find((x) => x.id === a.beneficiaryId);
                return (
                  <Card key={a.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '700', color: colors.text }}>{a.date}</Text>
                      {a.adHoc && (
                        <Text style={{ color: colors.amber, fontSize: 12, fontWeight: '700' }}>Ad-hoc</Text>
                      )}
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                      {b?.school} {b?.class} {b?.section}
                    </Text>
                    <Text style={{ color: colors.text, fontSize: 13 }}>
                      Time in: {a.timeIn || '--'}   Time out: {a.timeOut || '--'}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {a.geoVerified ? 'Geofence verified' : 'Not geofence-verified'}
                    </Text>
                  </Card>
                );
              })
          ))}
      </ScrollView>
    </Screen>
  );
}
