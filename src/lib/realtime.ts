import { supabase } from './supabase';

export function subscribeToOperations(onChange: () => void) {
  const channel = supabase
    .channel('operations-dashboard')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
