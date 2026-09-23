// SCREEN 6 (Facilitator): Content library -- search + download material
// published by Admin (ContentAdminScreen).
import React, { useState } from 'react';
import { ScrollView, Text, View, Linking, Alert } from 'react-native';
import { useData } from '../../data/store';
import { Screen, Card, Field, SecondaryButton } from '../../components/UI';
import { colors, spacing } from '../../theme';

export default function ContentScreen() {
  const { db } = useData();
  const [query, setQuery] = useState('');

  const filtered = db.content.filter((c) => {
    const cat = db.categories.find((x) => x.id === c.categoryId);
    const haystack = `${c.title} ${cat?.pillar || ''} ${cat?.topic || ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

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
      <ScrollView showsVerticalScrollIndicator={false}>
        {filtered.map((c) => {
          const cat = db.categories.find((x) => x.id === c.categoryId);
          return (
            <Card key={c.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{c.title}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {cat?.pillar} - {c.fileType}
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
