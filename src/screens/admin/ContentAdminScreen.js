// SCREEN 4 (Admin): Content (upload) -- publish session material for
// facilitators to find/download on their Content screen. Accepts any file
// type (PDF, PPT, Word, Excel, audio, video, images, etc.), uploads the
// bytes to the backend's /api/files (Cloudflare R2 when configured, local
// disk otherwise -- see backend/src/routes/files.js), then records the
// metadata with the returned storagePath and openable fileUrl.
//
// Layout: the published list comes first, with a round "+" button at the top
// right. Tapping "+" opens the upload form in a popup. Row actions
// (view / remove) are compact icons.
import React, { useState } from 'react';
import {
  ScrollView,
  Text,
  View,
  Alert,
  TouchableOpacity,
  Linking,
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

// Small tappable icon used in each record row (view / remove).
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

// Row above the list: "Published (8)" on the left, "+" on the right.
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

export default function ContentAdminScreen() {
  const { currentUser } = useAuth();
  const { db, addRecord, deleteRecord, nextId } = useData();
  const [categoryId, setCategoryId] = useState(db.categories[0]?.id);
  const [picked, setPicked] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  function closeAdd() {
    setShowAdd(false);
    setPicked(null);
  }

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
        date: todayLocalYMD(),
        storagePath,
        fileUrl: url,
      });
      closeAdd();
    } catch (e) {
      Alert.alert('Publish failed', e.message || 'Please try again.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md }}>
        Session content
      </Text>

      <ScrollView showsVerticalScrollIndicator={false}>
        <ListHeader
          title="Published"
          count={db.content.length}
          onAdd={() => setShowAdd(true)}
          addLabel="Upload content"
        />

        <AddModal visible={showAdd} title="Upload session content" onClose={closeAdd}>
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
        </AddModal>

        {db.content.map((c) => {
          const cat = db.categories.find((x) => x.id === c.categoryId);
          return (
            <Card key={c.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{c.title}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {cat?.pillar} - {c.fileType} - {c.date}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {c.fileUrl && (
                    <IconButton
                      name="open-outline"
                      color={colors.primary}
                      label="View"
                      onPress={() => Linking.openURL(c.fileUrl)}
                    />
                  )}
                  <IconButton
                    name="trash-outline"
                    color={colors.red}
                    label="Remove"
                    onPress={() =>
                      Alert.alert('Remove content', `Unpublish ${c.title}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => deleteRecord('content', c.id) },
                      ])
                    }
                  />
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
