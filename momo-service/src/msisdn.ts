/**
 * Numéros de téléphone → MSISDN au format international attendu par MTN.
 *
 * Un client écrit son numéro comme il veut (« 06 123 45 67 », « +242 06 123 45 67 »,
 * « 00242061234567 »). MTN attend « 242 » suivi des 9 chiffres locaux, sans « + ». Se tromper
 * ici produit un 400 opaque côté MTN : d'où la normalisation explicite et testée.
 */

import { MSISDN_SANDBOX_TEST, type EnvironnementMomo } from './config.ts';

export const PREFIXE_CONGO = '242';

/** Numéros mobiles congolais : un 0 puis 4 (Airtel), 5 ou 6 (MTN). */
const LOCAL_CONGO = /^0[456]\d{7}$/;

export class ErreurTelephone extends Error {}

export function normaliserMsisdn(brut: string, env: EnvironnementMomo = 'mtncongo'): string {
  const chiffres = String(brut ?? '').replace(/[^\d]/g, '');

  if (!chiffres) {
    throw new ErreurTelephone('Numéro de téléphone manquant.');
  }

  // Les numéros de test du sandbox MTN ne suivent pas la numérotation congolaise.
  if (env === 'sandbox' && (MSISDN_SANDBOX_TEST as readonly string[]).includes(chiffres)) {
    return chiffres;
  }

  // 242 06 123 45 67  |  00242 06 123 45 67
  const sansIndicatif = chiffres.replace(/^(00)?242/, '');
  const local = sansIndicatif.startsWith('0') ? sansIndicatif : `0${sansIndicatif}`;

  if (!LOCAL_CONGO.test(local)) {
    throw new ErreurTelephone(
      `Numéro invalide : « ${brut} ». Attendu un mobile congolais à 9 chiffres (06 / 05 / 04) ou son format international 242…`,
    );
  }

  return `${PREFIXE_CONGO}${local}`;
}

/** Affichage lisible d'un MSISDN normalisé (jamais de numéro complet dans les journaux). */
export function masquerMsisdn(msisdn: string): string {
  return msisdn.length > 4 ? `${msisdn.slice(0, 5)}••••${msisdn.slice(-2)}` : '••••';
}
