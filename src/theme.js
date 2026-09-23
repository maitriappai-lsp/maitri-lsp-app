// Shared design tokens so every screen looks consistent with the spec's mockups
// (cream background, orange primary action, RAG colours for status chips).
export const colors = {
  bg: '#F7F3EA',
  card: '#FFFFFF',
  border: '#E4DCC8',
  text: '#2A2620',
  textMuted: '#75705F',
  primary: '#D97B3F',
  primaryDark: '#B5622D',
  green: '#3F8B4C',
  amber: '#C98A1E',
  red: '#C0392B',
  chipBg: '#EFE8D8',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const ragColor = (rag) => {
  if (!rag) return colors.textMuted;
  const r = rag.toLowerCase();
  if (r.startsWith('g')) return colors.green;
  if (r.startsWith('a')) return colors.amber;
  if (r.startsWith('r')) return colors.red;
  return colors.textMuted;
};
