import { redirect } from 'next/navigation';

import { exigerAcces } from '@/server/admin/acces';

/** Ancienne page « Prestataires », remplacée par la section Partenaires (Elembo Partners, lot 1.5). */
export default async function PagePrestataires() {
  await exigerAcces('partenaires.voir');
  redirect('/admin/partenaires');
}
