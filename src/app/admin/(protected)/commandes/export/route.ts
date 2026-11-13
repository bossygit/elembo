import { aujourdhui, bornesDates, documentCsv, estDateIso } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import {
  estStatutCommande,
  estStatutPaiement,
  libelleCommande,
  libelleMode,
  libellePaiement,
} from '@/lib/admin/statuts';
import { verifierAccesRoute } from '@/server/admin/acces';
import { journaliser } from '@/server/admin/audit';
import { lignesDesCommandes, rechercherCommandes } from '@/server/admin/commandes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIGNES = 5000;

/**
 * Export CSV des commandes filtrées (mêmes filtres que la liste). `format=lignes` exporte une
 * ligne par article (taille, couleur, quantités). Réservé aux rôles `commandes.exporter`.
 */
export async function GET(request: Request) {
  const acces = await verifierAccesRoute('commandes.exporter');
  if (!acces.ok) return acces.reponse;
  const { staff } = acces;

  const url = new URL(request.url);
  const p = url.searchParams;
  const statut = estStatutCommande(p.get('statut')) ? (p.get('statut') as never) : null;
  const paiement = estStatutPaiement(p.get('paiement')) ? (p.get('paiement') as never) : null;
  const du = estDateIso(p.get('du')) ? p.get('du')! : undefined;
  const au = estDateIso(p.get('au')) ? p.get('au')! : undefined;
  const texte = (p.get('q') ?? '').slice(0, 120);
  const format = p.get('format') === 'lignes' ? 'lignes' : 'commandes';
  const { debut, fin } = bornesDates(du, au);
  const marges = peut(staff.role, 'marges.voir');

  let commandes;
  try {
    ({ commandes } = await rechercherCommandes({ texte, statut, paiement, debut, fin, limite: MAX_LIGNES, decalage: 0 }));
  } catch {
    return Response.json({ erreur: 'Export indisponible.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  let csv: string;
  if (format === 'lignes') {
    const parId = new Map(commandes.map((c) => [c.id, c]));
    const lignes = await lignesDesCommandes(commandes.map((c) => c.id));
    csv = documentCsv(
      [
        'Référence', 'Date', 'Statut', 'Client', 'Désignation', 'Produit', 'Taille', 'Couleur',
        'Quantité', 'Prix unitaire (FCFA)', 'Total ligne (FCFA)',
        ...(marges ? ['Coût unitaire (FCFA)', 'Marge ligne (FCFA)'] : []),
      ],
      lignes.map((l) => {
        const c = parId.get(l.commande_id);
        const contact = (c?.contact_snapshot ?? {}) as Record<string, unknown>;
        const options = l.options ?? {};
        return [
          c?.reference, c?.cree_le, c ? libelleCommande(c.statut).label : '', contact.nom,
          l.designation, l.produit_id, options.taille ?? options.formatId ?? '', options.couleur ?? '',
          l.quantite, l.prix_unitaire_fcfa, l.total_ligne_fcfa,
          ...(marges ? [l.cout_unitaire_fcfa, l.total_ligne_fcfa - l.quantite * l.cout_unitaire_fcfa] : []),
        ];
      }),
    );
  } else {
    csv = documentCsv(
      [
        'Référence', 'Créée le', 'Statut', 'Paiement', 'Mode de paiement', 'Origine', 'Client', 'Société',
        'Téléphone', 'Email', 'Ville', 'Sous-total (FCFA)', 'Livraison (FCFA)', 'Total (FCFA)',
        ...(marges ? ['Coût (FCFA)', 'Marge (FCFA)'] : []),
        'Payée le', 'Livraison prévue', 'Livrée le',
      ],
      commandes.map((c) => {
        const contact = c.contact_snapshot as Record<string, unknown>;
        return [
          c.reference, c.cree_le, libelleCommande(c.statut).label, libellePaiement(c.statut_paiement).label,
          libelleMode(c.mode_paiement), c.devis_id ? 'Devis' : 'Directe', contact.nom, contact.societe,
          contact.telephone, contact.email, c.ville, c.sous_total_fcfa, c.livraison_fcfa, c.total_fcfa,
          ...(marges ? [c.cout_fcfa, c.marge_fcfa] : []),
          c.paye_le, c.livraison_prevue_le, c.livree_le,
        ];
      }),
    );
  }

  await journaliser({
    staff,
    action: 'EXPORT_COMMANDES',
    entite: 'export',
    apres: { format, nb: commandes.length, filtres: { texte, statut, paiement, du, au } },
  });

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="elembo-${format}-${aujourdhui()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
