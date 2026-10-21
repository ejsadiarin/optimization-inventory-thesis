import type { Offcut } from '@/engine/types';

export interface ReusableOffcutEntry {
  key: string;
  sheetIndex: number;
  offcut: Offcut;
}

export function offcutKey(sheetIndex: number, offcut: Offcut): string {
  return `${sheetIndex}:${offcut.x.toFixed(3)}:${offcut.y.toFixed(3)}:${offcut.length.toFixed(3)}:${offcut.width.toFixed(3)}`;
}
