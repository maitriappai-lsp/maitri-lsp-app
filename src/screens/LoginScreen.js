// SCREEN 1 (both apps): Login.
// Phone + password sign-in, forced password change on first login, and a
// stubbed "forgot password" flow (real version should trigger an
// Admin-mediated reset per the spec, since there is no self-signup).
import React, { useState } from 'react';
import { Text, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useData } from '../data/store';
import { Screen, Card, Field, PrimaryButton, SecondaryButton } from '../components/UI';
import { colors, spacing } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const { changePassword } = useData();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [pendingUser, setPendingUser] = useState(null); // set when mustChangePassword
  const [newPassword, setNewPassword] = useState('');

  async function handleSignIn() {
    const result = await login(phone.trim(), password);
    if (!result.ok) {
      Alert.alert('Sign in failed', result.error);
      return;
    }
    if (result.user.mustChangePassword) {
      setPendingUser(result.user);
    }
  }

  async function handleForcedChange() {
    if (newPassword.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    try {
      await changePassword(pendingUser.id, newPassword);
      setPendingUser(null);
    } catch (e) {
      Alert.alert('Could not update password', e.message || 'Please try again.');
    }
  }

  if (pendingUser) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Card>
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: spacing.xs, color: colors.text }}>
            Set a new password
          </Text>
          <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
            First-time login for {pendingUser.name}. Choose a password only you know.
          </Text>
          <Field
            label="New password"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="At least 6 characters"
          />
          <PrimaryButton title="Save & continue" onPress={handleForcedChange} />
        </Card>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen style={{ justifyContent: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: spacing.xs }}>
          Maitri LSP
        </Text>
        <Text style={{ color: colors.textMuted, marginBottom: spacing.xl }}>
          Use your registered phone number. New accounts are created by your
          Programme Admin -- there's no sign-up here.
        </Text>
        <Card>
          <Field
            label="Phone number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            placeholder="98400 1XXXX"
          />
          <Field
            label="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
          />
          <PrimaryButton title="Sign in" onPress={handleSignIn} />
          <SecondaryButton
            title="Forgot password? Contact your Admin"
            onPress={() =>
              Alert.alert(
                'Forgot password',
                'Password resets are issued by your Programme Admin -- ask them to set a new temporary password for your account.'
              )
            }
            style={{ marginTop: spacing.md, borderColor: 'transparent' }}
          />
        </Card>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: spacing.lg }}>
          Demo accounts: 9840012345 / changeme123 (Facilitator), 9840034567 /
          changeme123 (Admin), 9840023456 / changeme123 (Facilitator, forces
          password change).
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
