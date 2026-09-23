import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useData } from '../data/store';
import LoginScreen from '../screens/LoginScreen';
import FacilitatorTabs from './FacilitatorTabs';
import AdminTabs from './AdminTabs';
import { colors, spacing } from '../theme';

function TopBar() {
  const { currentUser, logout } = useAuth();
  const { db, updateRecord } = useData();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      // If there's an open (not timed-out) attendance session for today,
      // close it automatically rather than leaving it dangling -- a
      // facilitator forgetting to tap "Mark time out" shouldn't leave an
      // incomplete record behind.
      const today = new Date().toISOString().slice(0, 10);
      const open = db.attendance?.find(
        (a) => a.facilitatorId === currentUser?.id && a.date === today && !a.timeOut
      );
      if (open) {
        await updateRecord('attendance', open.id, { timeOut: new Date().toLocaleTimeString() });
      }
    } catch (e) {
      // Don't block sign-out over this -- surface it, but still sign out.
      Alert.alert('Note', "Couldn't auto-complete today's open attendance session, but you're signed out.");
    } finally {
      setSigningOut(false);
      logout();
    }
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
        paddingBottom: spacing.sm,
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View>
        <Text style={{ fontWeight: '700', color: colors.text }}>{currentUser?.name}</Text>
        <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>
          {currentUser?.role === 'Admin' ? 'Programme Admin' : 'LSP Resource'}
        </Text>
      </View>
      <TouchableOpacity onPress={handleSignOut} disabled={signingOut}>
        <Text style={{ color: colors.textMuted, fontWeight: '600' }}>
          {signingOut ? 'Signing out...' : 'Sign out'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RootNavigator() {
  const { currentUser, authReady } = useAuth();

  if (!authReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted }}>Loading…</Text>
      </View>
    );
  }

  if (!currentUser) return <LoginScreen />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar />
      <View style={{ flex: 1 }}>
        {currentUser.role === 'Admin' ? <AdminTabs /> : <FacilitatorTabs />}
      </View>
    </View>
  );
}
