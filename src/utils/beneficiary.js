// One place for how a beneficiary is written on screen:
// "School - Class Section" (class/section omitted when blank).
export function beneficiaryLabel(b, fallback = '') {
  if (!b) return fallback;
  const classSection = [b.class, b.section].filter(Boolean).join(' ');
  return [b.school, classSection].filter(Boolean).join(' - ');
}
