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
