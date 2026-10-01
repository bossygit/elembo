import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { chargerFichierEnv } from '../src/env-file.ts';

let dossier = '';
beforeEach(async () => {
  dossier = await mkdtemp(join(tmpdir(), 'env-'));
});
afterEach(async () => {
  await rm(dossier, { recursive: true, force: true });
});

async function ecrire(contenu: string): Promise<string> {
  const chemin = join(dossier, '.env');
  await writeFile(chemin, contenu, 'utf8');
  return chemin;
}

describe('lecture du fichier .env', () => {
  it('charge les variables et renvoie leurs noms (jamais les valeurs)', async () => {
    const chemin = await ecrire('MOMO_ENV=sandbox\nMOMO_SUBSCRIPTION_KEY=abc123\n# commentaire\n\nPORT=8787\n');
    const env: NodeJS.ProcessEnv = {};
    const noms = chargerFichierEnv(chemin, env);
    expect(noms).toEqual(['MOMO_ENV', 'MOMO_SUBSCRIPTION_KEY', 'PORT']);
    expect(env.MOMO_ENV).toBe('sandbox');
    expect(env.PORT).toBe('8787');
  });

  it('retire les guillemets qui entourent une valeur', async () => {
    const chemin = await ecrire('A="valeur entre guillemets"\nB=\'simple\'\n');
    const env: NodeJS.ProcessEnv = {};
    chargerFichierEnv(chemin, env);
    expect(env.A).toBe('valeur entre guillemets');
    expect(env.B).toBe('simple');
  });

  it('survit à une guillemet non fermée — le cas qui casse `source .env`', async () => {
    const chemin = await ecrire('password=abc"def\nMOMO_ENV=sandbox\nMOMO_API_KEY=0123456789abcdef\n');
    const env: NodeJS.ProcessEnv = {};
    const noms = chargerFichierEnv(chemin, env);
    expect(noms).toContain('MOMO_ENV');
    expect(noms).toContain('MOMO_API_KEY');
    expect(env.MOMO_ENV).toBe('sandbox');
    expect(env.MOMO_API_KEY).toBe('0123456789abcdef');
  });

  it('ignore les lignes inutilisables sans interrompre la lecture', async () => {
    const chemin = await ecrire('pas de signe egal\n=vide\n2INVALIDE=x\nMOMO_ENV=mtncongo\n');
    const env: NodeJS.ProcessEnv = {};
    const noms = chargerFichierEnv(chemin, env);
    expect(noms).toEqual(['MOMO_ENV']);
    expect(env.MOMO_ENV).toBe('mtncongo');
  });

  it('ne remplace pas une variable déjà présente dans l’environnement', async () => {
    const chemin = await ecrire('MOMO_ENV=sandbox\n');
    const env: NodeJS.ProcessEnv = { MOMO_ENV: 'mtncongo' };
    const noms = chargerFichierEnv(chemin, env);
    expect(noms).toEqual([]);
    expect(env.MOMO_ENV).toBe('mtncongo');
  });

  it('ne fait pas échouer le démarrage si le fichier est absent', () => {
    expect(chargerFichierEnv(join(dossier, 'inexistant.env'), {})).toEqual([]);
  });
});
