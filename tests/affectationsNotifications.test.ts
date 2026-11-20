/**
 * Lot 2.4 — notifications et fichiers partagés.
 * Vérifie les canaux, l'absence de montant dans les messages, le branchement du cron et la
 * sécurité du téléchargement (fonction de lecture + URL signée + audit).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const NOTIFS = lire('src/server/affectations/notifications.ts');
const ENTRETIEN = lire('src/server/affectations/entretien.ts');
const CRON = lire('src/app/api/cron/notifications/route.ts');
const ADMIN = lire('src/server/admin/affectations.ts');
const PORTAIL = lire('src/server/partenaires/travaux.ts');
const ROUTE = lire('src/app/partenaire/travaux/[id]/fichiers/[fichierId]/route.ts');
const ACTIONS_ADMIN = lire('src/app/admin/(protected)/affectations/actions.ts');
const ACTIONS_PORTAIL = lire('src/app/partenaire/travaux/actions.ts');

describe('notifications d’affectation', () => {
  it('couvre proposition, relance, décisions, annulation, expiration, fin et rappel', () => {
    for (const evenement of ['PROPOSEE', 'RELANCE', 'ACCEPTEE', 'REFUSEE', 'ANNULEE', 'EXPIREE', 'TERMINEE', 'RAPPEL']) {
      expect(NOTIFS, evenement).toContain(`case '${evenement}'`);
    }
  });

  it('prévient le responsable et la production, et le staff par e-mail et Telegram', () => {
    expect(NOTIFS).toContain("const ROLES_ATELIER = ['RESPONSABLE', 'PRODUCTION']");
    expect(NOTIFS).toMatch(/TELEGRAM_CHAT_ID/);
    expect(NOTIFS).toMatch(/DEVIS_NOTIFY_EMAIL/);
    expect(NOTIFS).toMatch(/cle_idempotence/);
  });

  it('n’écrit jamais de montant dans un message', () => {
    expect(NOTIFS).not.toMatch(/montant_fcfa|montant convenu|FCFA/i);
  });

  it('est branché sur les actions, le portail et le cron', () => {
    expect(ADMIN).toMatch(/notifierEvenementAffectation\(id, 'PROPOSEE'\)/);
    expect(ADMIN).toMatch(/notifierEvenementAffectation\(id, 'ANNULEE'/);
    expect(ADMIN).toMatch(/notifierEvenementAffectation\(id, 'RELANCE'\)/);
    expect(PORTAIL).toMatch(/notifierEvenementAffectation\(id, decision/);
    expect(PORTAIL).toMatch(/notifierEvenementAffectation\(id, 'TERMINEE'\)/);
    expect(CRON).toMatch(/expirerAffectationsEtNotifier\(\)/);
    expect(CRON).toMatch(/programmerRappelsAffectations\(\)/);
    expect(CRON).toMatch(/traiterNotifications\(50\)/);
    expect(ENTRETIEN).toMatch(/rpc\('expirer_affectations'\)/);
    expect(ACTIONS_ADMIN).toMatch(/after\(\(\) => traiterNotifications\(20\)/);
    expect(ACTIONS_PORTAIL).toMatch(/after\(\(\) => traiterNotifications\(20\)/);
  });
});

describe('fichiers partagés', () => {
  it('le téléchargement exige la session partenaire et une affectation de son entreprise', () => {
    expect(ROUTE).toMatch(/exigerPartenaire\('travaux\.voir'\)/);
    expect(ROUTE).toMatch(/monAffectation\(id\)/);
    expect(ROUTE).toMatch(/fichiers\.find/);
    expect(ROUTE).toMatch(/journaliserTelechargement/);
    expect(ROUTE).toMatch(/preparerTelechargement/);
    expect(ROUTE).not.toMatch(/from\('fichiers_commande'\)/);
  });

  it('refuse une affectation annulée ou un fichier non vérifié', () => {
    expect(ROUTE).toContain("['PROPOSEE', 'ACCEPTEE', 'TERMINEE']");
    expect(ROUTE).toMatch(/!fichier\.verifie/);
  });
});
