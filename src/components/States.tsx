import { AlertTriangle, Inbox, LoaderCircle, LockKeyhole } from 'lucide-react';

export function LoadingState({ label = 'Loading secure data…' }: { label?: string }) { return <div className="state"><LoaderCircle className="spin" /><p>{label}</p></div>; }
export function EmptyState({ title = 'Nothing here yet', body = 'Records will appear here when available.' }: { title?: string; body?: string }) { return <div className="state"><Inbox /><h3>{title}</h3><p>{body}</p></div>; }
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="state error"><AlertTriangle /><h3>Something went wrong</h3><p>{message}</p>{retry && <button onClick={retry}>Try again</button>}</div>; }
export function DeniedState() { return <div className="state"><LockKeyhole /><h2>Permission denied</h2><p>Your role does not allow access to this area.</p></div>; }
