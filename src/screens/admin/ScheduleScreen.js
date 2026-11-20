// SCREEN 2 (Admin): Schedule -- two-step recurring session builder.
// Step 1 generates dates from a recurrence rule (Monthly = every 4 weeks,
// per the spec's confirmed decision). Step 2 assigns a category to each
// generated date individually, since category can vary session to session.
//
// Layout: the annual schedule list comes first, with a round "+" button at
// the top right. Tapping "+" opens the two-step builder in a popup.
// Row actions (edit / delete) are compact icons.
import React, { useMemo, useState } from 'react';
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
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useData } from '../../data/store';
import { apiPost } from '../../data/api';
import { Screen, Card, SectionLabel, Field, Select, PrimaryButton, SecondaryButton, DateField, TimeField, Chip } from '../../components/UI';
import { colors, spacing } from '../../theme';
import { parseTimeToMinutes, todayLocalYMD, toLocalYMD } from '../../utils/date';
import { upcomingThenPast } from '../../utils/sort';
import { beneficiaryLabel } from '../../utils/beneficiary';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_INDEX = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
const FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly'];
const FREQUENCY_DAYS = { Weekly: 7, Fortnightly: 14, Monthly: 28 }; // Monthly = every 4 weeks, confirmed

// The assistant is optional. Select needs a real value for every option, so
// "no assistant" is represented by this sentinel in the UI and converted to
// null before anything is saved. An assistant can't be the same person as
// the session's facilitator, so that person is left out of the options.
const NO_ASSISTANT = 'NONE';
function assistantOptions(facilitators, excludeId) {
  return [
    { value: NO_ASSISTANT, label: 'None' },
    ...facilitators.filter((f) => f.id !== excludeId).map((f) => ({ value: f.id, label: f.name })),
  ];
}

// Schedule entries only have a start time, no end time, so "overlap" assumes
// each session lasts this long. A resource (facilitator OR assistant) can't
// be in two sessions on the same day whose start times are closer than this.
const SESSION_MINUTES = 60;

// Existing schedule entries that clash with `entry` ({ date, time,
// facilitatorId, assistantId }). The same person counts whether they're the
// facilitator or the assistant on the other entry. `ignoreId` skips the
// entry being edited.
function findConflicts(db, entry, ignoreId) {
  const start = parseTimeToMinutes(entry.time);
  if (start == null) return [];
  const people = [entry.facilitatorId, entry.assistantId].filter(Boolean);
  const out = [];
  for (const s of db.schedule) {
    if (s.id === ignoreId || s.date !== entry.date) continue;
    const other = parseTimeToMinutes(s.time);
    if (other == null || Math.abs(other - start) >= SESSION_MINUTES) continue;
    const clashing = people.filter((p) => p === s.facilitatorId || p === s.assistantId);
    if (clashing.length > 0) out.push({ sched: s, people: clashing });
  }
  return out;
}

function describeConflict(db, c) {
  const name = (id) => db.resources.find((r) => r.id === id)?.name || id;
  const b = db.beneficiaries.find((x) => x.id === c.sched.beneficiaryId);
  return `${c.people.map(name).join(' & ')} already booked at ${c.sched.time}${b ? ` (${beneficiaryLabel(b)})` : ''}`;
}

// First problem with a schedule entry ({ date, time, beneficiaryId,
// facilitatorId, assistantId }), as a message, or null if it's fine:
//  1. a beneficiary can have only one session on a given day (any facilitator);
//  2. a person can't be booked in two sessions at the same time.
function scheduleClash(db, entry, ignoreId) {
  if (entry.beneficiaryId) {
    const sameDay = db.schedule.find(
      (s) => s.id !== ignoreId && s.date === entry.date && s.beneficiaryId === entry.beneficiaryId
    );
    if (sameDay) {
      const b = db.beneficiaries.find((x) => x.id === entry.beneficiaryId);
      const f = db.resources.find((x) => x.id === sameDay.facilitatorId);
      return `${b ? `${b.school} - ${b.class}${b.section ? ' ' + b.section : ''}` : 'This beneficiary'} already has a session on ${entry.date}${f ? ` (${f.name})` : ''}`;
    }
  }
  const timeClash = findConflicts(db, entry, ignoreId)[0];
  return timeClash ? describeConflict(db, timeClash) : null;
}

// A scheduled session is "done" once a session record (psr) exists for the
// same visit: same date, beneficiary and facilitator. Such a schedule entry
// is locked against editing so the record it produced can't drift out of
// step with it.
function hasSession(db, sched) {
  return db.psr.some(
    (p) =>
      p.date === sched.date &&
      p.beneficiaryId === sched.beneficiaryId &&
      p.facilitatorId === sched.facilitatorId
  );
}

function generateDates(startDate, endDate, dayOfWeek, frequency) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const targetDow = DAY_INDEX[dayOfWeek];
  // Move start forward to the first matching day-of-week on or after start.
  const first = new Date(start);
  while (first.getDay() !== targetDow) first.setDate(first.getDate() + 1);
  const stepDays = FREQUENCY_DAYS[frequency];
  const dates = [];
  const cursor = new Date(first);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + stepDays);
  }
  return dates;
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

// Small tappable icon used in each record row (edit / delete).
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

// Row above the list: "Annual schedule (12)" on the left, "+" on the right.
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

// Bottom-sheet popup that holds the "Add sessions" builder.
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

// ---- Grouping / table / export helpers ------------------------------------

const UNKNOWN_SCHOOL = 'Unknown school';

// Table-view columns. Widths are fixed so the header and every row line up,
// and the whole table scrolls sideways when it is wider than the screen.
const TABLE_COLUMNS = [
  { key: 'date', label: 'Date', width: 96 },
  { key: 'time', label: 'Time', width: 60 },
  { key: 'class', label: 'Class', width: 90 },
  { key: 'facilitator', label: 'Facilitator', width: 130 },
  { key: 'assistant', label: 'Assistant', width: 130 },
  { key: 'category', label: 'Category', width: 190 },
  { key: 'status', label: 'Status', width: 80 },
];
const ACTIONS_WIDTH = 84;

function classLabel(b) {
  return b ? [b.class, b.section].filter(Boolean).join(' ') : '';
}

// Quote a value for CSV (Excel opens .csv directly).
function csvCell(v) {
  const t = v == null ? '' : String(v);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

// Collapsible school header: name on the left, counts on the right.
function SchoolHeader({ school, total, upcoming, open, onToggle }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${school}, ${total} sessions`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.chipBg,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        marginBottom: spacing.sm,
      }}
    >
      <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.text} />
      <Text style={{ flex: 1, marginLeft: spacing.sm, fontWeight: '800', color: colors.text, fontSize: 15 }} numberOfLines={1}>
        {school}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        {total} session{total === 1 ? '' : 's'}
        {upcoming > 0 ? ` \u00b7 ${upcoming} upcoming` : ''}
      </Text>
    </TouchableOpacity>
  );
}

// Excel-style grid for one school's sessions: header row, one line per
// session, thin borders, striped rows, scrolls sideways on a phone.
function ScheduleTable({ rows, db, onEdit, onDelete }) {
  const today = todayLocalYMD();
  const cell = (width, children, extra) => (
    <View
      style={{
        width,
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        justifyContent: 'center',
        ...extra,
      }}
    >
      {children}
    </View>
  );
  const text = (t, extra) => (
    <Text style={{ fontSize: 12, color: colors.text, ...extra }} numberOfLines={2}>
      {t || '\u2014'}
    </Text>
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled style={{ marginBottom: spacing.md }}>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.card }}>
        <View style={{ flexDirection: 'row', backgroundColor: colors.chipBg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          {TABLE_COLUMNS.map((c) => (
            <React.Fragment key={c.key}>
              {cell(c.width, text(c.label, { fontWeight: '800' }))}
            </React.Fragment>
          ))}
          {cell(ACTIONS_WIDTH, text('Actions', { fontWeight: '800' }))}
        </View>
        {rows.map((s, i) => {
          const b = db.beneficiaries.find((x) => x.id === s.beneficiaryId);
          const f = db.resources.find((x) => x.id === s.facilitatorId);
          const asst = s.assistantId ? db.resources.find((x) => x.id === s.assistantId) : null;
          const c = db.categories.find((x) => x.id === s.categoryId);
          const locked = hasSession(db, s);
          const upcoming = s.date >= today;
          const status = locked ? 'Recorded' : upcoming ? 'Upcoming' : 'Past';
          const statusColor = locked ? colors.green : upcoming ? colors.primary : colors.textMuted;
          return (
            <View
              key={s.id}
              style={{
                flexDirection: 'row',
                backgroundColor: i % 2 === 0 ? colors.card : colors.bg,
                borderBottomWidth: i === rows.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              {cell(TABLE_COLUMNS[0].width, text(s.date))}
              {cell(TABLE_COLUMNS[1].width, text(s.time))}
              {cell(TABLE_COLUMNS[2].width, text(classLabel(b)))}
              {cell(TABLE_COLUMNS[3].width, text(f?.name))}
              {cell(TABLE_COLUMNS[4].width, text(asst?.name))}
              {cell(TABLE_COLUMNS[5].width, text(c ? `${c.pillar} / ${c.topic}` : ''))}
              {cell(TABLE_COLUMNS[6].width, text(status, { color: statusColor, fontWeight: '700' }))}
              {cell(
                ACTIONS_WIDTH,
                <View style={{ flexDirection: 'row' }}>
                  <IconButton
                    name={locked ? 'lock-closed-outline' : 'create-outline'}
                    color={locked ? colors.textMuted : colors.primary}
                    label={locked ? 'Edit locked' : 'Edit'}
                    onPress={() => onEdit(s)}
                  />
                  <IconButton name="trash-outline" color={colors.red} label="Delete" onPress={() => onDelete(s, b)} />
                </View>,
                { borderRightWidth: 0, paddingVertical: 2 }
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

export default function ScheduleScreen() {
  const { db, addRecord, deleteRecord, updateRecord, nextIds, refresh } = useData();

  const [beneficiaryId, setBeneficiaryId] = useState(db.beneficiaries[0]?.id);
  const [facilitatorId, setFacilitatorId] = useState(
    db.resources.find((r) => r.role === 'Facilitator')?.id
  );
  const [assistantId, setAssistantId] = useState(NO_ASSISTANT);
  const [frequency, setFrequency] = useState('Weekly');
  const [dayOfWeek, setDayOfWeek] = useState('Monday');
  const [startDate, setStartDate] = useState('2026-09-21');
  const [endDate, setEndDate] = useState('2026-12-11');
  const [time, setTime] = useState('10:00');

  const [showAdd, setShowAdd] = useState(false);
  const [step, setStep] = useState(1);
  const [generatedDates, setGeneratedDates] = useState([]);
  const [categoryBySession, setCategoryBySession] = useState({});

  const facilitators = db.resources.filter((r) => r.role === 'Facilitator');

  // ---- List controls: date range, grouping by school, list/table view ----
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'table'
  const [openSchools, setOpenSchools] = useState({}); // school name -> true when expanded
  const [exporting, setExporting] = useState(false);

  // Sessions inside the date range, grouped by school. Within each school the
  // order is upcoming first (soonest at the top), then past sessions.
  const groups = useMemo(() => {
    const bySchool = new Map();
    for (const s of db.schedule) {
      if (fromDate && s.date < fromDate) continue;
      if (toDate && s.date > toDate) continue;
      const b = db.beneficiaries.find((x) => x.id === s.beneficiaryId);
      const school = b?.school || UNKNOWN_SCHOOL;
      if (!bySchool.has(school)) bySchool.set(school, []);
      bySchool.get(school).push(s);
    }
    const today = todayLocalYMD();
    return [...bySchool.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([school, rows]) => ({
        school,
        rows: rows.sort(upcomingThenPast),
        upcoming: rows.filter((r) => r.date >= today).length,
      }));
  }, [db.schedule, db.beneficiaries, fromDate, toDate]);

  const shownCount = groups.reduce((n, g) => n + g.rows.length, 0);
  const rangeActive = Boolean(fromDate || toDate);
  const allOpen = groups.length > 0 && groups.every((g) => openSchools[g.school]);

  function toggleSchool(school) {
    setOpenSchools((prev) => ({ ...prev, [school]: !prev[school] }));
  }
  function setAllSchools(open) {
    const next = {};
    groups.forEach((g) => (next[g.school] = open));
    setOpenSchools(next);
  }

  const todayYMD = todayLocalYMD();
  const monthStart = todayYMD.slice(0, 8) + '01';
  const now = new Date();
  const monthEnd = toLocalYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  function confirmDelete(s, b) {
    Alert.alert('Delete session', `Remove ${beneficiaryLabel(b)} on ${s.date}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('schedule', s.id) },
    ]);
  }

  // Edit from the table view: the edit form lives in the list view, so switch.
  function editFromTable(s) {
    startEdit(s);
    if (!hasSession(db, s)) setViewMode('list');
  }

  // Exports exactly what is on screen (date range applied) as a .csv that
  // opens in Excel, with names instead of internal ids.
  async function exportCsv() {
    if (shownCount === 0) {
      Alert.alert('Nothing to export', 'No sessions match the current date range.');
      return;
    }
    setExporting(true);
    try {
      const header = ['School', 'Class', 'Section', 'Date', 'Time', 'Facilitator', 'Assistant', 'Pillar', 'Topic', 'Status'];
      const lines = [header.map(csvCell).join(',')];
      const today = todayLocalYMD();
      for (const g of groups) {
        for (const s of g.rows) {
          const b = db.beneficiaries.find((x) => x.id === s.beneficiaryId);
          const f = db.resources.find((x) => x.id === s.facilitatorId);
          const asst = s.assistantId ? db.resources.find((x) => x.id === s.assistantId) : null;
          const c = db.categories.find((x) => x.id === s.categoryId);
          const status = hasSession(db, s) ? 'Recorded' : s.date >= today ? 'Upcoming' : 'Past';
          lines.push(
            [g.school, b?.class, b?.section, s.date, s.time, f?.name, asst?.name, c?.pillar, c?.topic, status]
              .map(csvCell)
              .join(',')
          );
        }
      }
      const name = `schedule-${fromDate || 'start'}-to-${toDate || 'end'}.csv`;
      const uri = FileSystem.documentDirectory + name;
      // BOM so Excel reads non-English names correctly.
      await FileSystem.writeAsStringAsync(uri, '\uFEFF' + lines.join('\r\n'), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: name, UTI: 'public.comma-separated-values-text' });
      } else {
        Alert.alert('Export ready', `Saved to ${uri}`);
      }
    } catch (e) {
      Alert.alert('Export failed', e.message || 'Please try again.');
    } finally {
      setExporting(false);
    }
  }

  // Closes the popup and returns the builder to step 1 for next time.
  function closeAdd() {
    setShowAdd(false);
    setStep(1);
    setGeneratedDates([]);
    setCategoryBySession({});
  }

  function handleGenerate() {
    const dates = generateDates(startDate, endDate, dayOfWeek, frequency);
    if (dates.length === 0) {
      Alert.alert('No dates generated', 'Check your start/end dates and day of week.');
      return;
    }
    setGeneratedDates(dates);
    const defaults = {};
    dates.forEach((d) => (defaults[d] = db.categories[0]?.id));
    setCategoryBySession(defaults);
    setStep(2);
  }

  function saveDates(dates, skippedCount = 0) {
    const ids = nextIds('SCH', 'schedule', dates.length);
    dates.forEach((date, i) => {
      addRecord('schedule', {
        id: ids[i],
        beneficiaryId,
        facilitatorId,
        assistantId: assistantId === NO_ASSISTANT ? null : assistantId,
        date,
        time,
        categoryId: categoryBySession[date],
      });
    });
    Alert.alert(
      'Schedule saved',
      `${dates.length} session(s) added to the calendar.` +
        (skippedCount > 0 ? ` ${skippedCount} date(s) skipped because of time clashes.` : ''),
      [{ text: 'OK', onPress: closeAdd }],
      { cancelable: false }
    );
  }

  function confirmAndSaveAll() {
    const chosenAssistant = assistantId === NO_ASSISTANT ? null : assistantId;
    // Check every generated date against what's already on the schedule.
    const clashes = generatedDates
      .map((date) => ({
        date,
        msg: scheduleClash(db, { date, time, beneficiaryId, facilitatorId, assistantId: chosenAssistant }),
      }))
      .filter((x) => x.msg);

    if (clashes.length === 0) {
      saveDates(generatedDates);
      return;
    }

    const clashDates = new Set(clashes.map((x) => x.date));
    const clearDates = generatedDates.filter((d) => !clashDates.has(d));
    const preview = clashes
      .slice(0, 3)
      .map((x) => `${x.date}: ${x.msg}`)
      .join('\n');
    const more = clashes.length > 3 ? `\n+ ${clashes.length - 3} more` : '';
    const buttons = [{ text: 'Cancel', style: 'cancel' }];
    if (clearDates.length > 0) {
      buttons.push({
        text: `Save the other ${clearDates.length}`,
        onPress: () => saveDates(clearDates, clashes.length),
      });
    }
    Alert.alert(
      'Schedule clash',
      `${clashes.length} of ${generatedDates.length} date(s) clash with an existing session. A beneficiary can have only one session a day, and a person can't have two sessions starting within ${SESSION_MINUTES} minutes:\n\n${preview}${more}`,
      buttons
    );
  }

  // ---- Edit an existing scheduled session --------------------------------
  const [editingId, setEditingId] = useState(null);
  const [editBeneficiaryId, setEditBeneficiaryId] = useState(null);
  const [editFacilitatorId, setEditFacilitatorId] = useState(null);
  const [editAssistantId, setEditAssistantId] = useState(NO_ASSISTANT);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editCategoryId, setEditCategoryId] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  function startEdit(sess) {
    if (hasSession(db, sess)) {
      Alert.alert('Session already recorded', 'This schedule entry cannot be edited because a session record already exists for it.');
      return;
    }
    setEditingId(sess.id);
    setEditBeneficiaryId(sess.beneficiaryId);
    setEditFacilitatorId(sess.facilitatorId);
    setEditAssistantId(sess.assistantId || NO_ASSISTANT);
    setEditDate(sess.date);
    setEditTime(sess.time || '');
    setEditCategoryId(sess.categoryId);
  }

  async function saveEdit() {
    const current = db.schedule.find((x) => x.id === editingId);
    if (current && hasSession(db, current)) {
      setEditingId(null);
      return Alert.alert('Session already recorded', 'This schedule entry cannot be edited because a session record already exists for it.');
    }
    if (!editBeneficiaryId) return Alert.alert('Beneficiary required', 'Select a beneficiary.');
    if (!editFacilitatorId) return Alert.alert('Facilitator required', 'Select a facilitator.');
    if (editAssistantId !== NO_ASSISTANT && editAssistantId === editFacilitatorId) {
      return Alert.alert('Check the assistant', 'The assistant cannot be the same person as the facilitator.');
    }
    if (!editDate) return Alert.alert('Date required', 'Pick a date.');
    if (editDate < todayLocalYMD()) {
      return Alert.alert('Date is in the past', 'A scheduled session cannot be dated before today.');
    }
    if (parseTimeToMinutes(editTime) == null) {
      return Alert.alert('Check the time', 'Enter a time like 10:00 or 10:00 AM.');
    }
    const clash = scheduleClash(
      db,
      {
        date: editDate,
        time: editTime.trim(),
        beneficiaryId: editBeneficiaryId,
        facilitatorId: editFacilitatorId,
        assistantId: editAssistantId === NO_ASSISTANT ? null : editAssistantId,
      },
      editingId
    );
    if (clash) {
      return Alert.alert(
        'Schedule clash',
        `${clash}. A beneficiary can have only one session a day, and a person can't have two sessions starting within ${SESSION_MINUTES} minutes.`
      );
    }
    setSavingEdit(true);
    try {
      await updateRecord('schedule', editingId, {
        beneficiaryId: editBeneficiaryId,
        facilitatorId: editFacilitatorId,
        assistantId: editAssistantId === NO_ASSISTANT ? null : editAssistantId,
        date: editDate,
        time: editTime.trim(),
        categoryId: editCategoryId || null,
      });
      setEditingId(null);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Please try again.');
    } finally {
      setSavingEdit(false);
    }
  }

  const [importing, setImporting] = useState(false);

  async function importSchedule() {
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
      const outcome = await apiPost('/api/import/schedule', formData);
      await refresh();
      const errorPreview = outcome.errors?.length
        ? `\n\nFirst issue: ${outcome.errors[0]}${outcome.errors.length > 1 ? ` (+${outcome.errors.length - 1} more)` : ''}`
        : '';
      Alert.alert('Import complete', `${outcome.inserted} session(s) added, ${outcome.skipped} skipped.${errorPreview}`);
    } catch (e) {
      Alert.alert('Import failed', e.message || 'Please try again.');
    } finally {
      setImporting(false);
    }
  }

  function renderSession(s) {
            const b = db.beneficiaries.find((x) => x.id === s.beneficiaryId);
            const f = db.resources.find((x) => x.id === s.facilitatorId);
            const asst = s.assistantId ? db.resources.find((x) => x.id === s.assistantId) : null;
            const locked = hasSession(db, s);
            const c = db.categories.find((x) => x.id === s.categoryId);

            if (editingId === s.id) {
              return (
                <Card key={s.id}>
                  <Text style={{ fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>
                    Editing session
                  </Text>
                  <Select
                    label="Beneficiary"
                    value={editBeneficiaryId}
                    onSelect={setEditBeneficiaryId}
                    options={db.beneficiaries.map((x) => ({
                      value: x.id,
                      label: `${x.school} - ${x.class}${x.section ? ' ' + x.section : ''}`,
                    }))}
                  />
                  <Select
                    label="Facilitator"
                    value={editFacilitatorId}
                    onSelect={(v) => {
                      setEditFacilitatorId(v);
                      if (v === editAssistantId) setEditAssistantId(NO_ASSISTANT);
                    }}
                    options={facilitators.map((x) => ({ value: x.id, label: x.name }))}
                  />
                  <Select
                    label="Assistant (optional)"
                    value={editAssistantId}
                    onSelect={setEditAssistantId}
                    options={assistantOptions(facilitators, editFacilitatorId)}
                  />
                  <View style={{ flexDirection: 'row', gap: spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <DateField label="Date" value={editDate} onChange={setEditDate} minimumDate={new Date()} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TimeField label="Time" value={editTime} onChange={setEditTime} />
                    </View>
                  </View>
                  <Select
                    label="Category"
                    value={editCategoryId}
                    onSelect={setEditCategoryId}
                    options={db.categories.map((x) => ({ value: x.id, label: `${x.pillar} / ${x.topic}` }))}
                  />
                  <PrimaryButton title={savingEdit ? 'Saving...' : 'Save changes'} onPress={saveEdit} disabled={savingEdit} />
                  <SecondaryButton title="Cancel" onPress={() => setEditingId(null)} style={{ marginTop: spacing.sm }} />
                </Card>
              );
            }

            return (
              <Card key={s.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{beneficiaryLabel(b)}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {s.date} - {s.time} - {f?.name} assigned
                    </Text>
                    {asst && (
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        Assistant: {asst.name}
                      </Text>
                    )}
                    {locked && (
                      <Text style={{ color: colors.textMuted, fontSize: 12, fontStyle: 'italic' }}>
                        Session recorded -- editing locked
                      </Text>
                    )}
                    {c && (
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {c.pillar} / {c.topic}
                      </Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <IconButton
                      name={locked ? 'lock-closed-outline' : 'create-outline'}
                      color={locked ? colors.textMuted : colors.primary}
                      label={locked ? 'Edit locked' : 'Edit'}
                      onPress={() => startEdit(s)}
                    />
                    <IconButton
                      name="trash-outline"
                      color={colors.red}
                      label="Delete"
                      onPress={() => confirmDelete(s, b)}
                    />
                  </View>
                </View>
              </Card>
            );
  }

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: spacing.md }}>
          Schedule
        </Text>

        <ListHeader
          title="Annual schedule"
          count={db.schedule.length}
          onAdd={() => setShowAdd(true)}
          addLabel="Add sessions"
        />

        <AddModal
          visible={showAdd}
          title={step === 1 ? 'Add sessions (step 1 of 2)' : 'Add sessions (step 2 of 2)'}
          onClose={closeAdd}
        >
          {step === 1 && (
            <View>
              <SectionLabel>Step 1 -- define the recurrence</SectionLabel>
              <SectionLabel>Beneficiary</SectionLabel>
              <Select
                value={beneficiaryId}
                onSelect={setBeneficiaryId}
                options={db.beneficiaries.map((b) => ({
                  value: b.id,
                  label: `${b.school} - ${b.class}${b.section ? ' ' + b.section : ''}`,
                }))}
              />
              <SectionLabel>Facilitator</SectionLabel>
              <Select
                value={facilitatorId}
                onSelect={(v) => {
                  setFacilitatorId(v);
                  if (v === assistantId) setAssistantId(NO_ASSISTANT);
                }}
                options={facilitators.map((f) => ({ value: f.id, label: f.name }))}
              />
              <SectionLabel>Assistant (optional)</SectionLabel>
              <Select
                value={assistantId}
                onSelect={setAssistantId}
                options={assistantOptions(facilitators, facilitatorId)}
              />
              <SectionLabel>Frequency</SectionLabel>
              <Select
                value={frequency}
                onSelect={setFrequency}
                options={FREQUENCIES.map((f) => ({ value: f, label: f === 'Monthly' ? 'Monthly (every 4 weeks)' : f }))}
              />
              <SectionLabel>Day of week</SectionLabel>
              <Select value={dayOfWeek} onSelect={setDayOfWeek} options={DAYS.map((d) => ({ value: d, label: d }))} />
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <DateField label="Start date" value={startDate} onChange={setStartDate} />
                </View>
                <View style={{ flex: 1 }}>
                  <DateField label="End date" value={endDate} onChange={setEndDate} />
                </View>
              </View>
              <TimeField label="Time" value={time} onChange={setTime} />
              <PrimaryButton title="Generate dates" onPress={handleGenerate} />
            </View>
          )}

          {step === 2 && (
            <View>
              <SectionLabel>Step 2 -- assign category per session ({generatedDates.length} dates)</SectionLabel>
              {generatedDates.map((date) => (
                <View key={date} style={{ marginBottom: spacing.md }}>
                  <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 4 }}>{date}</Text>
                  <Select
                    value={categoryBySession[date]}
                    onSelect={(v) => setCategoryBySession((prev) => ({ ...prev, [date]: v }))}
                    options={db.categories.map((c) => ({ value: c.id, label: `${c.pillar} / ${c.topic}` }))}
                  />
                </View>
              ))}
              <PrimaryButton title="Confirm & save all" onPress={confirmAndSaveAll} />
              <SecondaryButton title="Back" onPress={() => setStep(1)} style={{ marginTop: spacing.sm }} />
            </View>
          )}
        </AddModal>

        {/* ---- Date range + view controls ---- */}
        <Card>
          <SectionLabel>Filter by date</SectionLabel>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <DateField label="From" value={fromDate} onChange={setFromDate} />
            </View>
            <View style={{ flex: 1 }}>
              <DateField label="To" value={toDate} onChange={setToDate} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Chip label="Upcoming" active={fromDate === todayYMD && !toDate} onPress={() => { setFromDate(todayYMD); setToDate(''); }} />
            <Chip label="This month" active={fromDate === monthStart && toDate === monthEnd} onPress={() => { setFromDate(monthStart); setToDate(monthEnd); }} />
            <Chip label="Clear" active={false} onPress={() => { setFromDate(''); setToDate(''); }} />
          </View>
          {fromDate && toDate && fromDate > toDate ? (
            <Text style={{ color: colors.red, fontSize: 12, marginTop: spacing.sm }}>
              "From" is after "To", so no sessions can match.
            </Text>
          ) : null}
        </Card>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.xs }}>
          <Chip label="List" active={viewMode === 'list'} onPress={() => setViewMode('list')} />
          <Chip label="Table" active={viewMode === 'table'} onPress={() => setViewMode('table')} />
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => setAllSchools(!allOpen)} disabled={groups.length === 0}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
              {allOpen ? 'Collapse all' : 'Expand all'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
          Showing {shownCount} of {db.schedule.length} session(s) across {groups.length} school(s)
          {rangeActive ? ' in the selected dates' : ''}
        </Text>
        <SecondaryButton
          title={exporting ? 'Preparing...' : 'Export shown sessions (Excel / CSV)'}
          onPress={exportCsv}
          disabled={exporting}
          style={{ marginBottom: spacing.md }}
        />

        {groups.length === 0 && (
          <Text style={{ color: colors.textMuted, padding: spacing.md }}>
            {db.schedule.length === 0 ? 'No sessions scheduled yet.' : 'No sessions in the selected dates.'}
          </Text>
        )}

        {groups.map((g) => {
          const open = Boolean(openSchools[g.school]);
          return (
            <View key={g.school}>
              <SchoolHeader
                school={g.school}
                total={g.rows.length}
                upcoming={g.upcoming}
                open={open}
                onToggle={() => toggleSchool(g.school)}
              />
              {open &&
                (viewMode === 'table' ? (
                  <ScheduleTable rows={g.rows} db={db} onEdit={editFromTable} onDelete={confirmDelete} />
                ) : (
                  g.rows.map((s) => renderSession(s))
                ))}
            </View>
          );
        })}

        <Card>
          <SectionLabel>Import from Excel</SectionLabel>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm }}>
            Bulk-upload the entire schedule master directly, as an alternative to the recurrence builder above.
            Column headers (row 1): School, Class, Section, Facilitator Phone, Date, Time, Pillar, Topic, Subtopic,
            Assistant Phone (Pillar/Topic/Subtopic and Assistant Phone optional).
          </Text>
          <SecondaryButton title={importing ? 'Importing...' : 'Choose file & import'} onPress={importSchedule} disabled={importing} />
        </Card>
      </ScrollView>
    </Screen>
  );
}