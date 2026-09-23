// SCREEN 4 (Facilitator): Uploads.
// Uses expo-document-picker to pick any file (photo, PDF, audio, etc.),
// uploads the bytes to the backend's /api/files (Cloudflare R2 when
// configured, local disk otherwise -- see backend/src/routes/files.js),
// then records the metadata with the returned storagePath and openable
// fileUrl.
import React, { useState } from 'react';
import { ScrollView, Text, View, Alert, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { apiPost } from '../../data/api';
import { Screen, Card, SectionLabel, Field, Select, PrimaryButton, SecondaryButton } from '../../components/UI';
import { colors, spacing } from '../../theme';

export default function UploadsScreen() {
  const { currentUser } = useAuth();
  const { db, addRecord, nextId } = useData();

  const [beneficiaryId, setBeneficiaryId] = useState(db.beneficiaries[0]?.id);
  const [categoryId, setCategoryId] = useState(db.categories[0]?.id);
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState(null);
  const [uploading, setUploading] = useState(false);

  const myUploads = db.uploads
    .filter((u) => u.facilitatorId === currentUser?.id)
    .slice()
    .reverse();

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
        date: new Date().toISOString().slice(0, 10),
        description,
        storagePath,
        fileUrl: url,
      });
      setPicked(null);
      setDescription('');
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
          Upload a file
        </Text>
        <Card>
          <SectionLabel>Link to beneficiary</SectionLabel>
          <Select
            value={beneficiaryId}
            onSelect={setBeneficiaryId}
            options={db.beneficiaries.map((b) => ({ value: b.id, label: `${b.school} - ${b.class}` }))}
          />
          <SectionLabel>Link to service category</SectionLabel>
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
          <PrimaryButton title="Upload" onPress={upload} disabled={!picked} />
        </Card>

        <SectionLabel>Uploaded this week</SectionLabel>
        {myUploads.slice(0, 10).map((u) => {
          const b = db.beneficiaries.find((x) => x.id === u.beneficiaryId);
          return (
            <Card key={u.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{u.fileName}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {b?.school} - {u.date}
                  </Text>
                </View>
                {u.fileUrl ? (
                  <SecondaryButton title="View" onPress={() => Linking.openURL(u.fileUrl)} />
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>No file</Text>
                )}
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
