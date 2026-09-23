import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTable } from '../hooks/useTable';
import { DataTable, type Column } from '../components/DataTable';
import { ErrorState, LoadingState } from '../components/States';

export function ResourcePage<T extends object>({ title, description, table, columns, action }: { title: string; description: string; table: Parameters<typeof useTable>[0]; columns: Column<T>[]; action?: React.ReactNode }) {
  const query = useTable<T>(table); const [search, setSearch] = useState('');
  const rows = useMemo(() => (query.data ?? []).filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  return <><header className="page-header"><div><h1>{title}</h1><p>{description}</p></div>{action}</header><section className="panel"><div className="toolbar"><label className="search"><Search /><span className="sr-only">Search {title}</span><input placeholder={`Search ${title.toLowerCase()}…`} value={search} onChange={(event) => setSearch(event.target.value)} /></label><span>{rows.length} records</span></div>{query.isLoading ? <LoadingState /> : query.error ? <ErrorState message={query.error.message} retry={() => void query.refetch()} /> : <DataTable rows={rows} columns={columns} caption={title} />}</section></>;
}
