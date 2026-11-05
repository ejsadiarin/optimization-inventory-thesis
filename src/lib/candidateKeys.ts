export function declinedKey(requirementId: string, pieceId: string): string {
  return `${requirementId}::${pieceId}`;
}
