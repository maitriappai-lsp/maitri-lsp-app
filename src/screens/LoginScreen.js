// SCREEN 1 (both apps): Login.
// Phone + password sign-in, forced password change on first login, and a
// stubbed "forgot password" flow (real version should trigger an
// Admin-mediated reset per the spec, since there is no self-signup).
import React, { useState } from 'react';
import { Text, Alert, KeyboardAvoidingView, Platform, Image, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useData } from '../data/store';
import { apiPost } from '../data/api';
import { Screen, Card, Field, PrimaryButton, SecondaryButton } from '../components/UI';
import { colors, spacing } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const { changePassword } = useData();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [pendingUser, setPendingUser] = useState(null); // set when mustChangePassword
  const [newPassword, setNewPassword] = useState('');

  // "Change password" from the sign-in screen (no sign-in needed: the
  // current password proves who it is).
  const [changing, setChanging] = useState(false);
  const [cpPhone, setCpPhone] = useState('');
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpBusy, setCpBusy] = useState(false);

  function openChangePassword() {
    setCpPhone(phone);
    setCpCurrent('');
    setCpNew('');
    setCpConfirm('');
    setChanging(true);
  }

  async function handleChangePassword() {
    if (!cpPhone.trim() || !cpCurrent || !cpNew || !cpConfirm) {
      return Alert.alert('Missing details', 'Fill in all four fields.');
    }
    if (cpNew.length < 6) return Alert.alert('Password too short', 'Use at least 6 characters.');
    if (cpNew !== cpConfirm) return Alert.alert('Passwords do not match', 'Re-enter the new password in both fields.');
    if (cpNew === cpCurrent) return Alert.alert('Choose a different password', 'The new password must differ from the current one.');
    setCpBusy(true);
    try {
      await apiPost('/api/auth/change-password-with-old', {
        phone: cpPhone.trim(),
        currentPassword: cpCurrent,
        newPassword: cpNew,
      });
      setPhone(cpPhone.trim());
      setPassword('');
      setChanging(false);
      Alert.alert('Password changed', 'Sign in with your new password.');
    } catch (e) {
      Alert.alert('Could not change password', e.message || 'Please try again.');
    } finally {
      setCpBusy(false);
    }
  }

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
        <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 160, height: 57 }}
            resizeMode="contain"
          />
        </View>
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

  if (changing) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        enabled={Platform.OS === 'ios'}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Screen style={{ justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 160, height: 57 }}
              resizeMode="contain"
            />
          </View>
          <Card>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: spacing.xs, color: colors.text }}>
              Change password
            </Text>
            <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
              Enter your phone number and current password, then choose a new one.
            </Text>
            <Field
              label="Phone number"
              keyboardType="phone-pad"
              value={cpPhone}
              onChangeText={setCpPhone}
              placeholder="98400 1XXXX"
            />
            <Field
              label="Current password"
              secureTextEntry
              value={cpCurrent}
              onChangeText={setCpCurrent}
            />
            <Field
              label="New password"
              secureTextEntry
              value={cpNew}
              onChangeText={setCpNew}
              placeholder="At least 6 characters"
            />
            <Field
              label="Confirm new password"
              secureTextEntry
              value={cpConfirm}
              onChangeText={setCpConfirm}
            />
            <PrimaryButton
              title={cpBusy ? 'Saving...' : 'Change password'}
              onPress={handleChangePassword}
              disabled={cpBusy}
            />
            <SecondaryButton
              title="Back to sign in"
              onPress={() => setChanging(false)}
              disabled={cpBusy}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      enabled={Platform.OS === 'ios'}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen style={{ justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 180, height: 64 }}
            resizeMode="contain"
          />
        </View>
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
            title="Change password"
            onPress={openChangePassword}
            style={{ marginTop: spacing.md }}
          />
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
       
      </Screen>
    </KeyboardAvoidingView>
  );
}
