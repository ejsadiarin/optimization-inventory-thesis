export const MEMBER_COLORS = [
  '#93c5fd',
  '#fcd34d',
  '#6ee7b7',
  '#fca5a5',
  '#c4b5fd',
  '#fdba74',
  '#67e8f9',
  '#f9a8d4',
  '#bef264',
  '#cbd5e1',
] as const;

export function buildMemberColorMap(memberLabels: Iterable<string>): Map<string, string> {
  const labels = [...new Set(memberLabels)].sort((a, b) => a.localeCompare(b));

  return new Map(
    labels.map((label, index) => [label, MEMBER_COLORS[index % MEMBER_COLORS.length]!]),
  );
}
