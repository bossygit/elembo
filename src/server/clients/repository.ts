import { supabaseAdmin } from '@/server/supabase/client';

function admin() { return supabaseAdmin(); }
function erreur(message: string) { return new Error(message); }

export type ClientLigne = {
  id: string;
  type_client: string;
  nom: string;
  societe: string | null;
  email: string | null;
  telephone: string;
  ville: string | null;
  notes: string | null;
  cree_le: string;
};

export async function listerClients(): Promise<ClientLigne[]> {
  const { data, error } = await admin().from('clients').select('*').order('nom');
  if (error) throw erreur(error.message);
  return (data ?? []) as ClientLigne[];
}

export async function clientParId(id: string): Promise<ClientLigne | null> {
  const { data, error } = await admin().from('clients').select('*').eq('id', id).maybeSingle();
  if (error) throw erreur(error.message);
  return (data as ClientLigne | null) ?? null;
}

export async function commandesDuClient(clientId: string) {
  const { data, error } = await admin().from('commandes').select('*').eq('client_id', clientId).order('cree_le', { ascending: false });
  if (error) throw erreur(error.message);
  return data ?? [];
}
