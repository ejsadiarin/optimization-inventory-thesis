/**
 * Assigns each panel at most one distinct inventory piece.
 *
 * A panel is only reusable if it can claim a piece no other reusable panel
 * also claims. Greedy assignment is not enough: a panel with many candidates
 * can take the only piece a later panel can use. This finds the maximum
 * one-to-one assignment (augmenting paths), so the returned map is the
 * largest set of panels that can be reused together.
 */
export function maxPanelAssignments(
  panelIds: readonly string[],
  candidatesByPanel: ReadonlyMap<string, readonly string[]>,
): Record<string, string> {
  const pieceToPanel = new Map<string, string>();

  function tryAssign(panelId: string, visited: Set<string>): boolean {
    for (const pieceId of candidatesByPanel.get(panelId) ?? []) {
      if (visited.has(pieceId)) continue;
      visited.add(pieceId);
      const currentPanel = pieceToPanel.get(pieceId);
      if (currentPanel === undefined || tryAssign(currentPanel, visited)) {
        pieceToPanel.set(pieceId, panelId);
        return true;
      }
    }
    return false;
  }

  panelIds.forEach((panelId) => {
    tryAssign(panelId, new Set());
  });

  const assignments: Record<string, string> = {};
  pieceToPanel.forEach((panelId, pieceId) => {
    assignments[panelId] = pieceId;
  });
  return assignments;
}
