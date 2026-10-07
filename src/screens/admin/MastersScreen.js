// SCREEN 1 (Admin): Masters -- tabbed Resources / Beneficiaries / Categories / Geo.
// Full Add/Edit/Delete on each, plus an "Import from Excel" stub (real
// version parses an .xlsx with exceljs/SheetJS server-side and upserts by
// code, per Section 6 -- picking a file here just simulates that).
//
// Layout: each tab shows its list of records first, with a round "+" button
// at the top right. Tapping "+" opens the Add form in a bottom-sheet popup.
// Row actions (edit / deactivate / delete) are compact icons.
import React, { useState } from 'react';
import {
  ScrollView,
  Text,
  View,
  Alert,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { useData } from '../../data/store';
import { apiPost } from '../../data/api';
import { todayLocalYMD } from '../../utils/date';
import { Screen, Card, Chip, Field, Select, PrimaryButton, SecondaryButton, SectionLabel, DateField } from '../../components/UI';
import { colors, spacing } from '../../theme';

const TABS = ['Resources', 'Geo', 'Beneficiaries', 'Life Skills'];

export default function MastersScreen() {
  const [tab, setTab] = useState('Resources');

  return (
    <Screen>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.sm }}>
        Masters
      </Text>
      <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        {TABS.map((t) => (
          <Chip key={t} label={t} active={tab === t} onPress={() => setTab(t)} />
        ))}
      </View>
      {tab === 'Resources' && <ResourcesTab />}
      {tab === 'Geo' && <GeoTab />}
      {tab === 'Beneficiaries' && <BeneficiariesTab />}
      {tab === 'Life Skills' && <CategoriesTab />}
    </Screen>
  );
}

// Round "+" button shown at the top-right of each master's list.
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

// Small tappable icon used in each record row (edit / deactivate / delete).
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

// Row above each list: "Resources (5)" on the left, "+" on the right.
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

// Bottom-sheet popup that holds an "Add ..." form.
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

function ImportFromExcel({ label, table, columnsHint }) {
  const { refresh } = useData();
  const [importing, setImporting] = useState(false);

  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
    });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' });
      const outcome = await apiPost(`/api/import/${table}`, formData);
      await refresh();
      const errorPreview = outcome.errors?.length
        ? `\n\nFirst issue: ${outcome.errors[0]}${outcome.errors.length > 1 ? ` (+${outcome.errors.length - 1} more)` : ''}`
        : '';
      Alert.alert(
        'Import complete',
        `${outcome.inserted} added, ${outcome.updated} updated, ${outcome.skipped} skipped.${errorPreview}`
      );
    } catch (e) {
      Alert.alert('Import failed', e.message || 'Please try again.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card>
      <SectionLabel>Import {label} from Excel</SectionLabel>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
        Upload an .xlsx, one row per record. Column headers (row 1): {columnsHint}. Matching rows are updated,
        new ones are added.
      </Text>
      <SecondaryButton title={importing ? 'Importing...' : 'Choose file & import'} onPress={pick} disabled={importing} />
    </Card>
  );
}

function ResourcesTab() {
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState('Volunteer');
  const [role, setRole] = useState('Facilitator');
  const [contractStart, setContractStart] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editType, setEditType] = useState('Volunteer');
  const [editRole, setEditRole] = useState('Facilitator');
  const [editContractStart, setEditContractStart] = useState('');
  const [editContractEnd, setEditContractEnd] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  async function addResource() {
    if (!name || !phone) return Alert.alert('Missing fields', 'Name and phone are required.');
    if (contractStart && !datePattern.test(contractStart)) {
      return Alert.alert('Invalid date', 'Contract start should be in YYYY-MM-DD format, e.g. 2026-06-01.');
    }
    if (contractEnd && !datePattern.test(contractEnd)) {
      return Alert.alert('Invalid date', 'Contract end should be in YYYY-MM-DD format, e.g. 2027-05-31.');
    }
    setSaving(true);
    try {
      await addRecord('resources', {
        id: nextId('R', 'resources'),
        name,
        phone,
        email: '',
        address: '',
        type,
        role,
        bloodGroup: '',
        emergencyContact: '',
        contractStart: contractStart || todayLocalYMD(),
        contractEnd,
        facialDataCaptured: false,
        password: 'changeme123',
        mustChangePassword: true,
      });
      Alert.alert(
        'Saved',
        `${name} added. Default password is changeme123 (they'll be asked to change it on first login).`,
        [{ text: 'OK', onPress: () => setShowAdd(false) }]
      );
      setName('');
      setPhone('');
      setContractStart('');
      setContractEnd('');
    } catch (e) {
      Alert.alert('Could not add', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(r) {
    setEditingId(r.id);
    setEditName(r.name || '');
    setEditPhone(r.phone || '');
    setEditType(r.type || 'Volunteer');
    setEditRole(r.role || 'Facilitator');
    setEditContractStart(r.contractStart || '');
    setEditContractEnd(r.contractEnd || '');
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit() {
    if (!editName || !editPhone) return Alert.alert('Missing fields', 'Name and phone are required.');
    if (editContractStart && !datePattern.test(editContractStart)) {
      return Alert.alert('Invalid date', 'Contract start should be in YYYY-MM-DD format, e.g. 2026-06-01.');
    }
    if (editContractEnd && !datePattern.test(editContractEnd)) {
      return Alert.alert('Invalid date', 'Contract end should be in YYYY-MM-DD format, e.g. 2027-05-31.');
    }
    setSavingEdit(true);
    try {
      await updateRecord('resources', editingId, {
        name: editName,
        phone: editPhone,
        type: editType,
        role: editRole,
        contractStart: editContractStart,
        contractEnd: editContractEnd,
      });
      Alert.alert('Saved', 'Resource updated.');
      setEditingId(null);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleActive(r) {
    const nextActive = !(r.active !== false); // treat missing/undefined as active
    Alert.alert(
      nextActive ? 'Reactivate resource' : 'Deactivate resource',
      nextActive
        ? `${r.name} will be able to log in again.`
        : `${r.name} won't be able to log in until reactivated. Their past records stay intact.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextActive ? 'Reactivate' : 'Deactivate',
          style: nextActive ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await updateRecord('resources', r.id, { active: nextActive });
            } catch (e) {
              Alert.alert('Could not update', e.message || 'Please try again.');
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <ListHeader
        title="Resources"
        count={db.resources.length}
        onAdd={() => setShowAdd(true)}
        addLabel="Add resource"
      />

      <AddModal visible={showAdd} title="Add resource" onClose={() => setShowAdd(false)}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Full name" />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="98400 XXXXX" />
        <SectionLabel>Resource type</SectionLabel>
        <Select
          value={type}
          onSelect={setType}
          options={['Volunteer', 'Honorary Staff', 'Staff'].map((v) => ({ value: v, label: v }))}
        />
        <SectionLabel>Role</SectionLabel>
        <Select
          value={role}
          onSelect={setRole}
          options={['Facilitator', 'Admin'].map((v) => ({ value: v, label: v }))}
        />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <DateField label="Contract start" value={contractStart} onChange={setContractStart} placeholder="Default: today" />
          </View>
          <View style={{ flex: 1 }}>
            <DateField label="Contract end (optional)" value={contractEnd} onChange={setContractEnd} />
          </View>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
          Facial data is captured on-device at onboarding. Aadhar is verified
          manually and never stored.
        </Text>
        <PrimaryButton title={saving ? 'Saving...' : 'Add resource'} onPress={addResource} disabled={saving} />
      </AddModal>

      {db.resources.map((r) => {
        const isActive = r.active !== false;
        return editingId === r.id ? (
          <Card key={r.id}>
            <SectionLabel>Edit resource</SectionLabel>
            <Field label="Name" value={editName} onChangeText={setEditName} placeholder="Full name" />
            <Field label="Phone" value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
            <SectionLabel>Resource type</SectionLabel>
            <Select
              value={editType}
              onSelect={setEditType}
              options={['Volunteer', 'Honorary Staff', 'Staff'].map((v) => ({ value: v, label: v }))}
            />
            <SectionLabel>Role</SectionLabel>
            <Select
              value={editRole}
              onSelect={setEditRole}
              options={['Facilitator', 'Admin'].map((v) => ({ value: v, label: v }))}
            />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <DateField label="Contract start" value={editContractStart} onChange={setEditContractStart} />
              </View>
              <View style={{ flex: 1 }}>
                <DateField label="Contract end (optional)" value={editContractEnd} onChange={setEditContractEnd} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton title={savingEdit ? 'Saving...' : 'Save'} onPress={saveEdit} disabled={savingEdit} />
              </View>
              <View style={{ flex: 1 }}>
                <SecondaryButton title="Cancel" onPress={cancelEdit} />
              </View>
            </View>
          </Card>
        ) : (
          <Card key={r.id} style={!isActive ? { opacity: 0.6 } : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{r.name}</Text>
                  {!isActive && (
                    <Text style={{ color: colors.red, fontWeight: '700', fontSize: 11 }}>INACTIVE</Text>
                  )}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {r.id} - {r.type} - {r.role}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Contract: {r.contractStart || '—'} to {r.contractEnd || 'open-ended'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => startEdit(r)} />
                <IconButton
                  name={isActive ? 'pause-circle-outline' : 'play-circle-outline'}
                  color={isActive ? colors.amber : colors.green}
                  label={isActive ? 'Deactivate' : 'Reactivate'}
                  onPress={() => toggleActive(r)}
                />
                <IconButton
                  name="trash-outline"
                  color={colors.red}
                  label="Delete"
                  onPress={() =>
                    Alert.alert('Delete resource', `Remove ${r.name}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('resources', r.id) },
                    ])
                  }
                />
              </View>
            </View>
          </Card>
        );
      })}

      <ImportFromExcel
        label="resources"
        table="resources"
        columnsHint="Name, Phone, Email, Address, Type, Role, Blood Group, Emergency Contact, Contract Start, Contract End"
      />
    </ScrollView>
  );
}

function BeneficiariesTab() {
  const { db, addRecord, updateRecord, deleteRecord, nextId, getGeo } = useData();
  const geoOptions = db.geo.map((g) => ({ value: g.id, label: `${g.school}${g.label ? ' - ' + g.label : ''}` }));

  const [geoId, setGeoId] = useState(geoOptions[0]?.value || '');
  const [school, setSchool] = useState(db.geo[0]?.school || '');
  const [klass, setKlass] = useState('');
  const [section, setSection] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editGeoId, setEditGeoId] = useState('');
  const [editSchool, setEditSchool] = useState('');
  const [editKlass, setEditKlass] = useState('');
  const [editSection, setEditSection] = useState('');

  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  function selectGeo(id) {
    setGeoId(id);
    const g = db.geo.find((x) => x.id === id);
    if (g) setSchool(g.school);
  }

  function selectEditGeo(id) {
    setEditGeoId(id);
    const g = db.geo.find((x) => x.id === id);
    if (g) setEditSchool(g.school);
  }

  async function add() {
    if (!school || !klass) return Alert.alert('Missing fields', 'School and class are required.');
    setSaving(true);
    try {
      await addRecord('beneficiaries', {
        id: nextId('EC', 'beneficiaries'),
        school,
        class: klass,
        section,
        geoId: geoId || '',
      });
      Alert.alert('Saved', 'Beneficiary added.', [{ text: 'OK', onPress: () => setShowAdd(false) }]);
      setKlass('');
      setSection('');
    } catch (e) {
      Alert.alert('Could not add', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(b) {
    setEditingId(b.id);
    setEditGeoId(b.geoId || '');
    setEditSchool(b.school || '');
    setEditKlass(b.class || '');
    setEditSection(b.section || '');
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit() {
    if (!editSchool || !editKlass) return Alert.alert('Missing fields', 'School and class are required.');
    setSavingEdit(true);
    try {
      await updateRecord('beneficiaries', editingId, {
        school: editSchool,
        class: editKlass,
        section: editSection,
        geoId: editGeoId || '',
      });
      Alert.alert('Saved', 'Beneficiary updated.');
      setEditingId(null);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <ListHeader
        title="Beneficiaries"
        count={db.beneficiaries.length}
        onAdd={() => setShowAdd(true)}
        addLabel="Add beneficiary"
      />

      <AddModal visible={showAdd} title="Add beneficiary" onClose={() => setShowAdd(false)}>
        {geoOptions.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
            No geofences set up yet -- you can still add this beneficiary, but
            attendance geofence checks won't work for it until you add one on
            the Geo tab and edit this beneficiary to link it.
          </Text>
        ) : (
          <>
            <SectionLabel>Geofence</SectionLabel>
            <Select value={geoId} onSelect={selectGeo} options={geoOptions} />
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
              Picking a geofence fills in the school name below -- edit it if
              you want a more specific name (e.g. a wing or campus name).
            </Text>
          </>
        )}
        <Field label="School" value={school} onChangeText={setSchool} placeholder="School name" />
        <Field label="Class" value={klass} onChangeText={setKlass} placeholder="Class 6" />
        <Field label="Section" value={section} onChangeText={setSection} placeholder="A" />
        <PrimaryButton title={saving ? 'Saving...' : 'Add beneficiary'} onPress={add} disabled={saving} />
      </AddModal>

      {db.beneficiaries.map((b) => {
        const g = getGeo(b.geoId);
        return editingId === b.id ? (
          <Card key={b.id}>
            <SectionLabel>Edit beneficiary</SectionLabel>
            <SectionLabel>Geofence</SectionLabel>
            {geoOptions.length > 0 && <Select value={editGeoId} onSelect={selectEditGeo} options={geoOptions} />}
            <Field label="School" value={editSchool} onChangeText={setEditSchool} />
            <Field label="Class" value={editKlass} onChangeText={setEditKlass} />
            <Field label="Section" value={editSection} onChangeText={setEditSection} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton title={savingEdit ? 'Saving...' : 'Save'} onPress={saveEdit} disabled={savingEdit} />
              </View>
              <View style={{ flex: 1 }}>
                <SecondaryButton title="Cancel" onPress={cancelEdit} />
              </View>
            </View>
          </Card>
        ) : (
          <Card key={b.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{b.school}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {b.id} - {b.class} {b.section}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Geofence: {g ? `${g.school}${g.label ? ' - ' + g.label : ''}` : 'not linked'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => startEdit(b)} />
                <IconButton
                  name="trash-outline"
                  color={colors.red}
                  label="Delete"
                  onPress={() =>
                    Alert.alert('Delete beneficiary', `Remove ${b.school} ${b.class}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('beneficiaries', b.id) },
                    ])
                  }
                />
              </View>
            </View>
          </Card>
        );
      })}
      <ImportFromExcel label="beneficiaries" table="beneficiaries" columnsHint="School, Class, Section" />
    </ScrollView>
  );
}

const PILLARS = ['Values', 'Health and Hygiene', 'Soft Skills', 'Environment', 'Creativity', 'Others'];

function CategoriesTab() {
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();
  const [pillar, setPillar] = useState(PILLARS[0]);
  const [topic, setTopic] = useState('OTHERS');
  const [subtopic, setSubtopic] = useState('OTHERS');
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editPillar, setEditPillar] = useState(PILLARS[0]);
  const [editTopic, setEditTopic] = useState('');
  const [editSubtopic, setEditSubtopic] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  async function add() {
    setSaving(true);
    try {
      await addRecord('categories', {
        id: nextId('LSS-CAT', 'categories'),
        pillar,
        topic,
        subtopic,
      });
      Alert.alert('Saved', 'Life skill category added.', [{ text: 'OK', onPress: () => setShowAdd(false) }]);
      setTopic('OTHERS');
      setSubtopic('OTHERS');
    } catch (e) {
      Alert.alert('Could not add', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditPillar(PILLARS.includes(c.pillar) ? c.pillar : PILLARS[0]);
    setEditTopic(c.topic || '');
    setEditSubtopic(c.subtopic || '');
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      await updateRecord('categories', editingId, { pillar: editPillar, topic: editTopic, subtopic: editSubtopic });
      Alert.alert('Saved', 'Life skill category updated.');
      setEditingId(null);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <ListHeader
        title="Life skills"
        count={db.categories.length}
        onAdd={() => setShowAdd(true)}
        addLabel="Add life skill"
      />

      <AddModal visible={showAdd} title="Add life skill category" onClose={() => setShowAdd(false)}>
        <SectionLabel>Pillar</SectionLabel>
        <Select value={pillar} onSelect={setPillar} options={PILLARS.map((p) => ({ value: p, label: p }))} />
        <Field label="Topic (Category 2)" value={topic} onChangeText={setTopic} placeholder="OTHERS" />
        <Field label="Sub-topic (Category 3, optional)" value={subtopic} onChangeText={setSubtopic} placeholder="OTHERS" />
        <PrimaryButton title={saving ? 'Saving...' : 'Add Life Skill'} onPress={add} disabled={saving} />
      </AddModal>

      {db.categories.map((c) =>
        editingId === c.id ? (
          <Card key={c.id}>
            <SectionLabel>Edit category</SectionLabel>
            <SectionLabel>Pillar</SectionLabel>
            <Select value={editPillar} onSelect={setEditPillar} options={PILLARS.map((p) => ({ value: p, label: p }))} />
            <Field label="Topic (Category 2)" value={editTopic} onChangeText={setEditTopic} />
            <Field label="Sub-topic (Category 3, optional)" value={editSubtopic} onChangeText={setEditSubtopic} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton title={savingEdit ? 'Saving...' : 'Save'} onPress={saveEdit} disabled={savingEdit} />
              </View>
              <View style={{ flex: 1 }}>
                <SecondaryButton title="Cancel" onPress={cancelEdit} />
              </View>
            </View>
          </Card>
        ) : (
          <Card key={c.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{c.pillar}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {c.id} - {c.topic} / {c.subtopic}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => startEdit(c)} />
                <IconButton
                  name="trash-outline"
                  color={colors.red}
                  label="Delete"
                  onPress={() =>
                    Alert.alert('Delete category', `Remove ${c.pillar}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('categories', c.id) },
                    ])
                  }
                />
              </View>
            </View>
          </Card>
        )
      )}
      <ImportFromExcel label="categories" table="categories" columnsHint="Pillar, Topic, Subtopic" />
    </ScrollView>
  );
}

function GeoTab() {
  const { db, addRecord, updateRecord, deleteRecord, nextId } = useData();
  const [school, setSchool] = useState('');
  const [label, setLabel] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('150');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [editRadius, setEditRadius] = useState('150');
  const [savingEdit, setSavingEdit] = useState(false);

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission needed', 'Enable location access to pick up your current position.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setLat(String(pos.coords.latitude));
      setLng(String(pos.coords.longitude));
    } catch (e) {
      Alert.alert('Could not get location', e.message || 'Please try again, or enter coordinates manually.');
    } finally {
      setLocating(false);
    }
  }

  // Note: the Add-geofence form opens in a popup. Tapping "+" fills in the
  // device's current location automatically (see onAdd below), so adding a
  // geofence from the actual site still needs no manual coordinate entry.

  async function add() {
    if (!school || !lat || !lng) return Alert.alert('Missing fields', 'School, latitude and longitude are required.');
    setSaving(true);
    try {
      await addRecord('geo', {
        id: nextId('GEO', 'geo'),
        school,
        label,
        lat: Number(lat),
        lng: Number(lng),
        radiusMeters: Number(radius) || 150,
      });
      Alert.alert('Saved', 'Geofence added.', [{ text: 'OK', onPress: () => setShowAdd(false) }]);
      setSchool('');
      setLabel('');
      setLat('');
      setLng('');
    } catch (e) {
      Alert.alert('Could not add', e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(g) {
    setEditingId(g.id);
    setEditLabel(g.label || '');
    setEditLat(String(g.lat));
    setEditLng(String(g.lng));
    setEditRadius(String(g.radiusMeters));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit() {
    if (!editLat || !editLng) return Alert.alert('Missing fields', 'Latitude and longitude are required.');
    setSavingEdit(true);
    try {
      await updateRecord('geo', editingId, {
        label: editLabel,
        lat: Number(editLat),
        lng: Number(editLng),
        radiusMeters: Number(editRadius) || 150,
      });
      Alert.alert('Saved', 'Geofence updated.');
      setEditingId(null);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <ListHeader
        title="Geofences"
        count={db.geo.length}
        onAdd={() => {
          setShowAdd(true);
          useCurrentLocation();
        }}
        addLabel="Add geofence"
      />

      <AddModal visible={showAdd} title="Add geofence" onClose={() => setShowAdd(false)}>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
          A school can have more than one geofence -- e.g. different blocks.
          Use the label to tell them apart when assigning one to a beneficiary.
        </Text>
        <Field label="School" value={school} onChangeText={setSchool} placeholder="School name" />
        <Field label="Label (optional)" value={label} onChangeText={setLabel} placeholder="e.g. Block A" />
        <SecondaryButton
          title={locating ? 'Getting current location...' : 'Use current location'}
          onPress={useCurrentLocation}
          disabled={locating}
          style={{ marginBottom: spacing.md }}
        />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Latitude" value={lat} onChangeText={setLat} keyboardType="decimal-pad" placeholder="13.0343" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Longitude" value={lng} onChangeText={setLng} keyboardType="decimal-pad" placeholder="80.2545" />
          </View>
        </View>
        <Field label="Radius (metres)" value={radius} onChangeText={setRadius} keyboardType="number-pad" />
        <PrimaryButton title={saving ? 'Saving...' : 'Add geofence'} onPress={add} disabled={saving} />
      </AddModal>

      {db.geo.map((g) =>
        editingId === g.id ? (
          <Card key={g.id}>
            <SectionLabel>Edit geofence -- {g.school}</SectionLabel>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
              School name can't be changed here -- delete and re-add if it was mistyped.
            </Text>
            <Field label="Label (optional)" value={editLabel} onChangeText={setEditLabel} placeholder="e.g. Block A" />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field label="Latitude" value={editLat} onChangeText={setEditLat} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Longitude" value={editLng} onChangeText={setEditLng} keyboardType="decimal-pad" />
              </View>
            </View>
            <Field label="Radius (metres)" value={editRadius} onChangeText={setEditRadius} keyboardType="number-pad" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton title={savingEdit ? 'Saving...' : 'Save'} onPress={saveEdit} disabled={savingEdit} />
              </View>
              <View style={{ flex: 1 }}>
                <SecondaryButton title="Cancel" onPress={cancelEdit} />
              </View>
            </View>
          </Card>
        ) : (
          <Card key={g.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>
                  {g.school}{g.label ? ` -- ${g.label}` : ''}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {g.lat.toFixed(4)}, {g.lng.toFixed(4)} - {g.radiusMeters}m
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <IconButton name="create-outline" color={colors.primary} label="Edit" onPress={() => startEdit(g)} />
                <IconButton
                  name="trash-outline"
                  color={colors.red}
                  label="Delete"
                  onPress={() =>
                    Alert.alert('Delete geofence', `Remove ${g.school}${g.label ? ` (${g.label})` : ''}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('geo', g.id) },
                    ])
                  }
                />
              </View>
            </View>
          </Card>
        )
      )}
      <ImportFromExcel label="geo" table="geo" columnsHint="School, Label, Latitude, Longitude, Radius Meters" />
    </ScrollView>
  );
}
