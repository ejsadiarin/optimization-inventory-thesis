const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatMeters(value: number): string {
  return `${value.toFixed(2)} m`;
}

export function formatPeso(value: number): string {
  return `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

export function materialTypeLabel(type: 'phenolic' | 'lumber'): string {
  return type === 'phenolic' ? 'Phenolic Board' : 'Lumber';
}

export function formatPieceDimensions(piece: {
  materialType: 'phenolic' | 'lumber';
  length: number;
  width: number;
  thickness: number;
  crossSection?: string;
}): string {
  if (piece.materialType === 'lumber') {
    return `${piece.length.toFixed(2)} m · ${piece.crossSection ?? '—'}`;
  }
  return `${piece.length.toFixed(2)} × ${piece.width.toFixed(2)} × ${piece.thickness.toFixed(2)} m`;
}


export function conditionBadgeClass(condition: 'Good' | 'For Inspection' | 'Retired'): string {
  if (condition === 'Good') return 'border-emerald-600/30 bg-emerald-50 text-emerald-700';
  if (condition === 'For Inspection') return 'border-amber-600/30 bg-amber-50 text-amber-700';
  return 'border-muted-foreground/30 bg-muted text-muted-foreground';
}
