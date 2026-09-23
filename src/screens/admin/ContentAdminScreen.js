// SCREEN 4 (Admin): Content (upload) -- publish session material for
// facilitators to find/download on their Content screen. Accepts any file
// type (PDF, PPT, Word, Excel, audio, video, images, etc.), uploads the
// bytes to the backend's /api/files (Cloudflare R2 when configured, local
// disk otherwise -- see backend/src/routes/files.js), then records the
// metadata with the returned storagePath and openable fileUrl.
import React, { useState } from 'react';
import { ScrollView, Text, View, Alert, TouchableOpacity, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../data/store';
import { apiPost } from '../../data/api';
import { Screen, Card, SectionLabel, Select, PrimaryButton, SecondaryButton } from '../../components/UI';
import { colors, spacing } from '../../theme';

// Labels the file by its extension rather than forcing everything into
// "PDF" or "PPT" -- content published here can reasonably be any of these.
function detectFileType(fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'PDF';
  if (['ppt', 'pptx'].includes(ext)) return 'PPT';
  if (['doc', 'docx'].includes(ext)) return 'Document';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Excel';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext)) return 'Audio';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'Video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'Image';
  return 'Other';
}

export default function ContentAdminScreen() {
  const { currentUser } = useAuth();
  const { db, addRecord, deleteRecord, nextId } = useData();
  const [categoryId, setCategoryId] = useState(db.categories[0]?.id);
  const [picked, setPicked] = useState(null);
  const [publishing, setPublishing] = useState(false);

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    setPicked(result.assets?.[0] || null);
  }

  async function publish() {
    if (!picked) return;
    setPublishing(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: picked.uri,
        name: picked.name,
        type: picked.mimeType || 'application/octet-stream',
      });
      const { storagePath, url } = await apiPost('/api/files', formData);

      await addRecord('content', {
        id: nextId('CNT', 'content'),
        title: picked.name,
        categoryId,
        fileType: detectFileType(picked.name),
        uploadedBy: currentUser?.id,
        date: new Date().toISOString().slice(0, 10),
        storagePath,
        fileUrl: url,
      });
      setPicked(null);
    } catch (e) {
      Alert.alert('Publish failed', e.message || 'Please try again.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md }}>
        Upload session content
      </Text>
      <Card>
        <SectionLabel>Service category</SectionLabel>
        <Select
          value={categoryId}
          onSelect={setCategoryId}
          options={db.categories.map((c) => ({ value: c.id, label: `${c.pillar} / ${c.topic}` }))}
        />
        <SecondaryButton
          title={picked ? `Selected: ${picked.name}` : 'Choose a file (any type)'}
          onPress={pickFile}
          style={{ marginBottom: spacing.md }}
        />
        <PrimaryButton title={publishing ? 'Publishing…' : 'Publish content'} onPress={publish} disabled={!picked || publishing} />
      </Card>

      <SectionLabel>Published</SectionLabel>
      <ScrollView showsVerticalScrollIndicator={false}>
        {db.content.map((c) => {
          const cat = db.categories.find((x) => x.id === c.categoryId);
          return (
            <Card key={c.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{c.title}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {cat?.pillar} - {c.fileType} - {c.date}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                  {c.fileUrl && (
                    <TouchableOpacity onPress={() => Linking.openURL(c.fileUrl)}>
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>View</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert('Remove content', `Unpublish ${c.title}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => deleteRecord('content', c.id) },
                      ])
                    }
                  >
                    <Text style={{ color: colors.red, fontWeight: '700' }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
