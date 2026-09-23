// SCREEN 3 (Admin): Attendance Override.
// Every override (geofence, face, or date bypass) is written to a
// permanent, timestamped audit log per the spec's confirmed decision.
import React, { useState } from 'react';
import { ScrollView, Text, View, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { Screen, Card, SectionLabel, Select, Field, PrimaryButton } from '../../components/UI';
import { colors, spacing } from '../../theme';

export default function OverrideScreen() {
  const { currentUser } = useAuth();
  const { db, logOverride } = useData();
  const facilitators = db.resources.filter((r) => r.role === 'Facilitator');
  const [resourceId, setResourceId] = useState(facilitators[0]?.id);
  const [bypassGeofence, setBypassGeofence] = useState(false);
  const [bypassFace, setBypassFace] = useState(false);
  const [reason, setReason] = useState('');

  function submit() {
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

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.xs }}>
        Attendance Override
      </Text>
      <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
        Use only when geofence, face match, or timing genuinely can't be met.
        Every override is logged with a reason.
      </Text>

      <Card>
        <SectionLabel>Resource</SectionLabel>
        <Select
          value={resourceId}
          onSelect={setResourceId}
          options={facilitators.map((f) => ({ value: f.id, label: f.name }))}
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
        <PrimaryButton title="Log override & mark attendance" onPress={submit} />
      </Card>

      <SectionLabel>Override log</SectionLabel>
      <ScrollView showsVerticalScrollIndicator={false}>
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
      </ScrollView>
    </Screen>
  );
}
