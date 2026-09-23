export function StatusChip({ value }: { value: string }) { return <span className={`status status-${value.replaceAll('_', '-')}`}>{value.replaceAll('_', ' ')}</span>; }
