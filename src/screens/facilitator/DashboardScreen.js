// SCREEN 5 (Facilitator): Dashboard.
// Date range + search + sub-tabs (Overview/Attendance/Sessions/Uploads) +
// RAG quick filters + tap-to-drill-down + Export to Excel (stubbed --
// wire to a server-side exceljs endpoint per Section 6 when the backend
// exists; client-side you could also use a library like react-native-xlsx).
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { apiGet } from '../../data/api';
import { Screen, Card, Field, Chip, RagChip, SecondaryButton, DateField } from '../../components/UI';
import { colors, spacing } from '../../theme';
import { todayLocalYMD } from '../../utils/date';

const TABS = ['Overview', 'Schedule', 'Attendance', 'Sessions', 'Uploads'];
const RAG_FILTERS = ['All', 'Green', 'Amber', 'Red'];

export default function DashboardScreen() {
  const { currentUser } = useAuth();
  const { db } = useData();
  const [tab, setTab] = useState('Overview');
  const [ragFilter, setRagFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('2026-09-01');
  const [to, setTo] = useState(todayLocalYMD());
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

  const mySchedule = useMemo(
    () =>
      db.schedule
        // Sessions where I'm the facilitator OR the assistant.
        .filter((s) => s.facilitatorId === currentUser?.id || s.assistantId === currentUser?.id)
        .filter((s) => s.date >= from && s.date <= to)
        .slice()
        .sort((a, b) => (a.date === b.date ? (a.time || '').localeCompare(b.time || '') : a.date < b.date ? -1 : 1)),
    [db, currentUser, from, to]
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ height: 40, flexGrow: 0, marginBottom: spacing.sm }}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }}
      >
        {TABS.map((t) => {
          const active = tab === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{
                height: 32,
                justifyContent: 'center',
                paddingHorizontal: 12,
                marginRight: spacing.xs,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primary : colors.chipBg,
              }}
            >
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.text }}>
                {t}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

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
            const sessionAssistant = p.assistantId ? db.resources.find((x) => x.id === p.assistantId) : null;
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
                      <Text style={{ color: colors.text, fontSize: 13 }}>Assistant: {sessionAssistant?.name || '-'}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Students present: {p.studentsPresent}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Rating: {p.rating}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Time: {p.timeIn} - {p.timeOut}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Facilitator feedback: {p.facilitatorFeedback || '-'}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>School feedback: {p.schoolFeedback || '-'}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>External org name: {p.externalOrgName || '-'}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>External resources: {p.externalResources || '-'}</Text>
                      <Text style={{ color: colors.text, fontSize: 13 }}>Photos taken and shared: {p.photosUploaded ? 'Yes' : 'No'}</Text>
                    </View>
                  )}
                </Card>
              </TouchableOpacity>
            );
          })}

        {tab === 'Schedule' &&
          (mySchedule.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>No scheduled sessions for this range.</Text>
          ) : (
            mySchedule.map((s) => {
              const b = db.beneficiaries.find((x) => x.id === s.beneficiaryId);
              const cat = db.categories.find((x) => x.id === s.categoryId);
              const isAssisting = s.assistantId === currentUser?.id && s.facilitatorId !== currentUser?.id;
              const mainFacilitator = db.resources.find((x) => x.id === s.facilitatorId);
              const assistant = s.assistantId ? db.resources.find((x) => x.id === s.assistantId) : null;
              return (
                <Card key={s.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{b?.school}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{s.date}</Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {b?.class} {b?.section} {s.time ? `- ${s.time}` : ''}
                  </Text>
                  {cat && (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {cat.pillar} / {cat.topic}
                    </Text>
                  )}
                  {isAssisting ? (
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
                      Assisting{mainFacilitator ? ` - Facilitator: ${mainFacilitator.name}` : ''}
                    </Text>
                  ) : (
                    assistant && (
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Assistant: {assistant.name}</Text>
                    )
                  )}
                </Card>
              );
            })
          ))}

        {tab === 'Uploads' &&
          myUploads.map((u) => (
            <Card key={u.id}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{u.fileName}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{u.date}</Text>
              {u.fileUrl ? (
                <SecondaryButton title="View" onPress={() => Linking.openURL(u.fileUrl)} style={{ marginTop: spacing.sm }} />
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.sm }}>
                  No file attached -- metadata only.
                </Text>
              )}
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
