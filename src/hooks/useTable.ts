import { useQuery } from '@tanstack/react-query';
import { listTable } from '../services/operations';

export function useTable<T>(table: Parameters<typeof listTable>[0]) {
  return useQuery({ queryKey: [table], queryFn: () => listTable<T>(table) });
}
