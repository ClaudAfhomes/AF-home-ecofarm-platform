import { EmptyState } from './States';

export type Column<T> = { key: keyof T | string; label: string; render?: (row: T) => React.ReactNode };
export function DataTable<T extends object>({ rows, columns, caption }: { rows: T[]; columns: Column<T>[]; caption: string }) {
  if (!rows.length) return <EmptyState />;
  return <div className="table-wrap"><table><caption className="sr-only">{caption}</caption><thead><tr>{columns.map((column) => <th key={String(column.key)}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={(row as { id?: string }).id ?? index}>{columns.map((column) => <td key={String(column.key)}>{column.render ? column.render(row) : String((row as Record<string, unknown>)[String(column.key)] ?? '—')}</td>)}</tr>)}</tbody></table></div>;
}
