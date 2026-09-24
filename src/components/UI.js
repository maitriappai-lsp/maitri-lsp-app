// Small shared presentational components used across screens, kept in one
// file since they're simple wrappers rather than a full design system.
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, FlatList, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, ragColor } from '../theme';

export function Screen({ children, style }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionLabel({ children }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function FieldLabel({ children }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function Field({ label, ...props }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        {...props}
      />
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.primaryBtn, disabled && styles.btnDisabled, style]}
    >
      <Text style={styles.primaryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({ title, onPress, disabled, style }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={[styles.secondaryBtn, disabled && styles.btnDisabled, style]}>
      <Text style={styles.secondaryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Chip({ label, active, onPress, color }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: color || colors.primary, borderColor: color || colors.primary },
      ]}
    >
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function RagChip({ rag }) {
  const c = ragColor(rag);
  return (
    <View style={[styles.ragChip, { borderColor: c }]}>
      <View style={[styles.ragDot, { backgroundColor: c }]} />
      <Text style={[styles.ragText, { color: c }]}>{rag}</Text>
    </View>
  );
}

export function Select({ label, value, options, onSelect, placeholder = 'Select...' }) {
  // A tap-to-open modal dropdown with a search box -- suited to long lists
  // (20-30+ options), unlike a chip row which wraps into a wall of buttons.
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TouchableOpacity
        style={styles.selectBox}
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
      >
        <Text style={[styles.selectBoxText, !selected && { color: colors.textMuted }]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.selectChevron}>{'\u25BE'}</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            {options.length > 6 ? (
              <TextInput
                style={[styles.input, { marginBottom: spacing.sm }]}
                placeholder="Search..."
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
            ) : null}
            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item.value)}
              style={{ maxHeight: 360 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={{ color: colors.textMuted, padding: spacing.md }}>No matches.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.optionRow, item.value === value && styles.optionRowActive]}
                  onPress={() => {
                    onSelect(item.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[styles.optionText, item.value === value && { color: colors.primary, fontWeight: '700' }]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export function DateField({ label, value, onChange, placeholder = 'YYYY-MM-DD' }) {
  // Native date picker wrapped to still read/write plain 'YYYY-MM-DD' strings,
  // so existing state/validation elsewhere doesn't need to change.
  const [show, setShow] = useState(false);
  const dateValue = value ? new Date(value + 'T00:00:00') : new Date();

  function handleChange(event, selectedDate) {
    if (Platform.OS === 'android') setShow(false);
    if (event.type === 'dismissed' || !selectedDate) return;
    onChange(selectedDate.toISOString().slice(0, 10));
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TouchableOpacity style={styles.selectBox} onPress={() => setShow(true)}>
        <Text style={[styles.selectBoxText, !value && { color: colors.textMuted }]}>{value || placeholder}</Text>
        <Text style={styles.selectChevron}>{'\uD83D\uDCC5'}</Text>
      </TouchableOpacity>
      {show &&
        (Platform.OS === 'ios' ? (
          <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
            <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShow(false)}>
              <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
                <DateTimePicker value={dateValue} mode="date" display="spinner" onChange={handleChange} />
                <PrimaryButton title="Done" onPress={() => setShow(false)} />
              </View>
            </TouchableOpacity>
          </Modal>
        ) : (
          <DateTimePicker value={dateValue} mode="date" display="default" onChange={handleChange} />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  fieldLabel: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: colors.text,
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.chipBg,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  chipText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  selectBoxText: { color: colors.text, fontSize: 15, flex: 1, marginRight: spacing.sm },
  selectChevron: { color: colors.textMuted, fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: spacing.md,
    maxHeight: '70%',
  },
  optionRow: {
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionRowActive: { backgroundColor: colors.chipBg },
  optionText: { color: colors.text, fontSize: 15 },
  ragChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  ragDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  ragText: { fontSize: 12, fontWeight: '700' },
});
