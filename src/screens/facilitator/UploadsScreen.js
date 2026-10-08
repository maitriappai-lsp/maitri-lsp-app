// SCREEN 4 (Facilitator): Uploads.
// Uses expo-document-picker to pick any file (photo, PDF, audio, etc.),
// uploads the bytes to the backend's /api/files (Cloudflare R2 when
// configured, local disk otherwise -- see backend/src/routes/files.js),
// then records the metadata with the returned storagePath and openable
// fileUrl.
//
// Layout: the list of my uploads comes first, with a round "+" button at the
// top right. Tapping "+" opens the upload form in a popup. The row action
// (view) is a compact icon.
import React, { useState } from 'react';
import {
  ScrollView,
  Text,
  View,
  Alert,
  Linking,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { apiPost } from '../../data/api';
import { todayLocalYMD } from '../../utils/date';
import { Screen, Card, SectionLabel, Field, Select, PrimaryButton, SecondaryButton } from '../../components/UI';
import { colors, spacing } from '../../theme';

// Round "+" button shown at the top-right of the list.
function AddButton({ onPress, label }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <Text style={{ color: '#fff', fontSize: 28, lineHeight: 30, fontWeight: '600' }}>+</Text>
    </TouchableOpacity>
  );
}

// Small tappable icon used in each record row (view).
function IconButton({ name, color, label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={{ padding: 6 }}
    >
      <Ionicons name={name} size={22} color={color} />
    </TouchableOpacity>
  );
}

// Row above the list: "My uploads (8)" on the left, "+" on the right.
function ListHeader({ title, count, onAdd, addLabel }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
        {title} ({count})
      </Text>
      <AddButton onPress={onAdd} label={addLabel} />
    </View>
  );
}

// Bottom-sheet popup that holds the upload form.
function AddModal({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        enabled={Platform.OS === 'ios'}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: colors.bg,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: spacing.lg,
              maxHeight: '90%',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
              <View style={{ height: spacing.xl }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function UploadsScreen() {
  const { currentUser } = useAuth();
  const { db, addRecord, nextId } = useData();

  const [beneficiaryId, setBeneficiaryId] = useState(db.beneficiaries[0]?.id);
  const [categoryId, setCategoryId] = useState(db.categories[0]?.id);
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const myUploads = db.uploads
    .filter((u) => u.facilitatorId === currentUser?.id)
    .slice()
    .reverse();

  function closeAdd() {
    setShowAdd(false);
    setPicked(null);
    setDescription('');
  }

  async function pickFile() {
    // No type restriction -- session evidence could be a photo, PDF, audio
    // clip, or any other file type, so let the facilitator pick anything.
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    setPicked(result.assets?.[0] || null);
  }

  async function upload() {
    if (!picked) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: picked.uri,
        name: picked.name,
        type: picked.mimeType || 'application/octet-stream',
      });
      const { storagePath, url } = await apiPost('/api/files', formData);

      await addRecord('uploads', {
        id: nextId('UPL', 'uploads'),
        fileName: picked.name,
        beneficiaryId,
        categoryId,
        facilitatorId: currentUser.id,
        date: todayLocalYMD(),
        description,
        storagePath,
        fileUrl: url,
      });
      closeAdd();
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.lg }}>
          Uploads
        </Text>

        <ListHeader
          title="My uploads"
          count={myUploads.length}
          onAdd={() => setShowAdd(true)}
          addLabel="Upload a file"
        />

        <AddModal visible={showAdd} title="Upload a file" onClose={closeAdd}>
          <SectionLabel>Link to beneficiary</SectionLabel>
          <Select
            value={beneficiaryId}
            onSelect={setBeneficiaryId}
            options={db.beneficiaries.map((b) => ({
              value: b.id,
              label: `${b.school} - ${b.class}${b.section ? ' ' + b.section : ''}`,
            }))}
          />
          <SectionLabel>Link to Life Skills Category</SectionLabel>
          <Select
            value={categoryId}
            onSelect={setCategoryId}
            options={db.categories.map((c) => ({ value: c.id, label: `${c.pillar} / ${c.topic}` }))}
          />
          <Field
            label="File description"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Session photos - role-play activity"
          />
          <SecondaryButton
            title={picked ? `Selected: ${picked.name}` : 'Tap to choose a file'}
            onPress={pickFile}
            style={{ marginBottom: spacing.md }}
          />
          <PrimaryButton title={uploading ? 'Uploading...' : 'Upload'} onPress={upload} disabled={!picked || uploading} />
        </AddModal>

        {myUploads.length === 0 && (
          <Text style={{ color: colors.textMuted, marginBottom: spacing.md }}>
            No uploads yet. Tap + to upload your first file.
          </Text>
        )}
        {myUploads.slice(0, 20).map((u) => {
          const b = db.beneficiaries.find((x) => x.id === u.beneficiaryId);
          return (
            <Card key={u.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{u.fileName}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {b?.school} - {u.date}
                  </Text>
                </View>
                {u.fileUrl ? (
                  <IconButton
                    name="open-outline"
                    color={colors.primary}
                    label="View"
                    onPress={() => Linking.openURL(u.fileUrl)}
                  />
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>No file</Text>
                )}
              </View>
            </Card>
          );
        })}
        {myUploads.length > 20 && (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>
            Showing your latest 20 uploads.
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}
