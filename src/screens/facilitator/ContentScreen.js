// SCREEN 6 (Facilitator): Content library -- search + download material
// published by Admin (ContentAdminScreen).
import React, { useState } from 'react';
import { ScrollView, Text, View, Linking, Alert } from 'react-native';
import { useData } from '../../data/store';
import { Screen, Card, Chip, Field, SecondaryButton } from '../../components/UI';
import { colors, spacing } from '../../theme';
import { latestFirst } from '../../utils/sort';

export default function ContentScreen() {
  const { db } = useData();
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('All'); // 'All' | 'Primary' | 'Middle'

  const filtered = db.content.filter((c) => {
    const cat = db.categories.find((x) => x.id === c.categoryId);
    if (level !== 'All' && c.gradeLevel !== level) return false;
    const haystack = `${c.title} ${cat?.pillar || ''} ${cat?.topic || ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }).sort(latestFirst(null));

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md }}>
        Find session content
      </Text>
      <Field
        placeholder="Search by pillar or topic"
        value={query}
        onChangeText={setQuery}
        style={{ marginBottom: spacing.md }}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
        {['All', 'Primary', 'Middle'].map((l) => (
          <Chip key={l} label={l} active={level === l} onPress={() => setLevel(l)} />
        ))}
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        {filtered.length === 0 && (
          <Text style={{ color: colors.textMuted, padding: spacing.md }}>No matching content.</Text>
        )}
        {filtered.map((c) => {
          const cat = db.categories.find((x) => x.id === c.categoryId);
          return (
            <Card key={c.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{c.title}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {cat?.pillar} - {c.fileType}
                    {c.gradeLevel ? ` - ${c.gradeLevel}` : ''}
                  </Text>
                </View>
                <SecondaryButton
                  title="Download"
                  onPress={() => {
                    if (c.fileUrl) {
                      Linking.openURL(c.fileUrl);
                    } else {
                      Alert.alert('Not available', 'This item has no file attached.');
                    }
                  }}
                />
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}