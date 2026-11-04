import type { Offcut } from '@/engine/types';

export interface ReusableOffcutEntry {
  key: string;
  sheetIndex: number;
  offcut: Offcut;
  pieceId?: string;
}

export function offcutKey(
  sheetIndex: number,
  offcut: Offcut,
  pieceId?: string,
): string {
  const dimensions = `${offcut.x.toFixed(3)}:${offcut.y.toFixed(3)}:${offcut.length.toFixed(3)}:${offcut.width.toFixed(3)}`;
  return pieceId ? `piece:${pieceId}:${dimensions}` : `${sheetIndex}:${dimensions}`;
}
