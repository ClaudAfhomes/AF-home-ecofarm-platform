import { ResourcePage } from './ResourcePage';
import { formatDate } from '../lib/format';
import type { Database } from '../lib/database.types';
type Audit = Database['public']['Tables']['audit_logs']['Row'];
export function AuditPage() { return <ResourcePage<Audit> title="Immutable audit log" description="Sensitive activity is append-only and retained for investigation and compliance." table="audit_logs" columns={[{ key: 'created_at', label: 'Time', render: (row) => formatDate(row.created_at) }, { key: 'action', label: 'Action' }, { key: 'entity_type', label: 'Entity' }, { key: 'entity_id', label: 'Record' }, { key: 'actor_id', label: 'Actor' }]} />; }
