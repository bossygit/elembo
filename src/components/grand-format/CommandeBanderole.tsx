'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import ApercuBanderole from '@/components/grand-format/ApercuBanderole';
import { ArrowRight, Check, Close } from '@/components/site/Icons';
import { envoyerFichiersDevis, type UploadSigne } from '@/lib/devis/envoiFichiers';
import {
  DELAIS,
  FINITIONS,
  LIMITES,
  PRESTATIONS,
  SUPPORTS,
  USAGES,
  formatDimensions,
  formatSurface,
  libelleDelai,
  libelleFinition,
  libellePrestation,
  libelleSupport,
  supportParId,
  surfaceM2,
  type DelaiId,
  type FinitionId,
  type PrestationId,
  type SupportId,
  type UsageId,
} from '@/lib/grand-format/catalogue';
import type { Estimation } from '@/lib/grand-format/estimation';
import { modeleParId, modelePrincipal, modelesPour } from '@/lib/grand-format/modeles';
import { lienWhatsApp } from '@/lib/site/marque';

/* ----------------------------------------------------------------- réglages ---- */

const ETAPES = ['Utilisation', 'Caractéristiques', 'Prestation', 'Fichiers', 'Prix', 'Confirmation'] as const;

/** Champ serveur → étape où le corriger. */
const ETAPE_DU_CHAMP: Record<string, number> = {
  usage: 0,
  support: 1,
  supportPrecision: 1,
  largeurM: 1,
  hauteurM: 1,
  quantite: 1,
  finition: 1,
  finitionPrecision: 1,
  delai: 1,
  dateSouhaitee: 1,
  prestation: 2,
  commentaire: 2,
  fichiers: 3,
};

const TYPES_ACCEPTES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/zip', 'application/x-zip-compressed'];
const MAX_FICHIERS = 5;
const MAX_FICHIER = 25 * 1024 * 1024;
const MAX_TOTAL = 50 * 1024 * 1024;

const FORMATS_RAPIDES: Record<string, [number, number][]> = {
  BANDEROLE: [[2, 1], [3, 1], [4, 1], [5, 1], [3, 1.5], [6, 1.5]],
  BACHE: [[3, 2], [4, 3], [6, 3], [8, 4]],
  PANNEAU: [[1, 0.7], [1.2, 0.8], [2, 1]],
};

type EtatEstimation =
  | { etat: 'inactif' }
  | { etat: 'chargement' }
  | { etat: 'pret'; resultat: Estimation }
  | { etat: 'indisponible'; message: string };

type Props = {
  initialUsage?: UsageId;
  initialModele?: string;
  initialPrestation?: PrestationId;
};

function metres(brut: string): number {
  const t = brut.trim().replace(',', '.');
  return /^\d{1,3}(\.\d{1,3})?$/.test(t) ? Math.round(Number(t) * 100) / 100 : Number.NaN;
}

function texteMetres(n: number): string {
  return String(n).replace('.', ',');
}

function taille(octets: number): string {
  return octets < 1024 * 1024 ? `${Math.max(1, Math.round(octets / 1024))} Ko` : `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

function fcfa(n: number): string {
  return `${n.toLocaleString('fr-FR').replace(/ | /g, ' ')} FCFA`;
}

function aujourdhui(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

const carte =
  'relative flex cursor-pointer flex-col rounded-2xl border border-filet bg-white p-4 transition-colors hover:border-encre/40 has-[:checked]:border-encre has-[:checked]:bg-sable has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-encre)] has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-orange';
const champ =
  'mt-1.5 block w-full rounded-xl border border-encre/25 bg-white px-3.5 py-3 text-base text-encre outline-none transition-colors placeholder:text-attenue/70 focus:border-encre focus:ring-2 focus:ring-orange/40';
const etiquette = 'block text-sm font-semibold text-encre';

function Erreur({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1.5 text-sm text-alerte" role="alert">
      {message}
    </p>
  ) : null;
}

/* -------------------------------------------------------------- composant ---- */

export default function CommandeBanderole({ initialUsage, initialModele, initialPrestation }: Props) {
  const router = useRouter();
  const modeleInitial = modeleParId(initialModele);
  const usageDepart = modeleInitial?.usage ?? initialUsage;
  const usageInitialFiche = USAGES.find((u) => u.id === usageDepart);
  const formatDepart = modeleInitial?.format ?? usageInitialFiche?.formatConseille ?? { largeurM: 3, hauteurM: 1 };

  const [etape, setEtape] = useState(usageDepart ? 1 : 0);
  const [usage, setUsage] = useState<UsageId | null>(usageDepart ?? null);
  const [modeleId, setModeleId] = useState<string | null>(modeleInitial?.id ?? null);
  const [support, setSupport] = useState<SupportId>(usageInitialFiche?.supportDefaut ?? 'BANDEROLE');
  const [supportPrecision, setSupportPrecision] = useState('');
  const [largeur, setLargeur] = useState(texteMetres(formatDepart.largeurM));
  const [hauteur, setHauteur] = useState(texteMetres(formatDepart.hauteurM));
  const [quantite, setQuantite] = useState(1);
  const [finition, setFinition] = useState<FinitionId>('OEILLETS');
  const [finitionPrecision, setFinitionPrecision] = useState('');
  const [delai, setDelai] = useState<DelaiId>('STANDARD');
  const [dateSouhaitee, setDateSouhaitee] = useState('');
  const [prestation, setPrestation] = useState<PrestationId | null>(initialPrestation ?? null);
  const [commentaire, setCommentaire] = useState('');
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [estimation, setEstimation] = useState<EtatEstimation>({ etat: 'inactif' });
  const [contact, setContact] = useState({ nom: '', telephone: '', email: '', societe: '', ville: 'Brazzaville' });
  const [consentement, setConsentement] = useState(false);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [erreurGlobale, setErreurGlobale] = useState('');
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const titreEtape = useRef<HTMLHeadingElement>(null);
  const etapePrecedente = useRef(etape);

  const fiche = supportParId(support);
  const finitionsApplicables = fiche?.finitionsApplicables ?? false;
  const finitionEffective: FinitionId = finitionsApplicables ? finition : 'SANS';
  const l = metres(largeur);
  const h = metres(hauteur);
  const dimensionsValides = [l, h].every((v) => Number.isFinite(v) && v >= LIMITES.dimensionMinM && v <= LIMITES.dimensionMaxM);
  const modele = modeleParId(modeleId) ?? (usage ? modelePrincipal(usage) : modelePrincipal('EVENEMENT'));

  const parametres = useMemo(
    () => ({
      usage,
      support,
      supportPrecision,
      largeurM: largeur.replace(',', '.'),
      hauteurM: hauteur.replace(',', '.'),
      quantite,
      finition: finitionEffective,
      finitionPrecision,
      delai,
      dateSouhaitee: delai === 'DATE' ? dateSouhaitee : '',
      prestation,
      commentaire,
    }),
    [usage, support, supportPrecision, largeur, hauteur, quantite, finitionEffective, finitionPrecision, delai, dateSouhaitee, prestation, commentaire],
  );

  // Accessibilité : le titre de l'étape reçoit le focus à chaque changement d'étape.
  useEffect(() => {
    // Comparaison avec l'étape précédente (et non un drapeau « premier rendu ») : robuste au
    // double appel des effets en mode strict.
    if (etapePrecedente.current === etape) return;
    etapePrecedente.current = etape;
    titreEtape.current?.focus();
    titreEtape.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [etape]);

  // Estimation SERVEUR à l'arrivée sur l'étape « Prix ». Le navigateur ne calcule aucun prix.
  const demandeEstimation = useRef(0);
  function lancerEstimation() {
    const numero = (demandeEstimation.current += 1);
    const indisponible = 'L’estimation en ligne est momentanément indisponible : votre demande sera chiffrée par devis.';
    setEstimation({ etat: 'chargement' });
    fetch('/api/banderoles/estimation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parametres),
    })
      .then(async (r) => {
        const resultat: EtatEstimation = r.ok
          ? { etat: 'pret', resultat: ((await r.json()) as { estimation: Estimation }).estimation }
          : { etat: 'indisponible', message: indisponible };
        // Une réponse tardive d'une demande précédente n'écrase jamais la plus récente.
        if (numero === demandeEstimation.current) setEstimation(resultat);
      })
      .catch(() => {
        if (numero === demandeEstimation.current) setEstimation({ etat: 'indisponible', message: indisponible });
      });
  }

  function changerEtape(n: number) {
    setEtape(n);
    if (n === 4) lancerEstimation();
  }

  /* ---------------------------------------------------------- validation ---- */

  function verifier(n: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (n === 0 && !usage) e.usage = 'Choisissez une utilisation.';
    if (n === 1) {
      if (!Number.isFinite(l) || l < LIMITES.dimensionMinM || l > LIMITES.dimensionMaxM) e.largeurM = 'Largeur entre 0,2 et 50 m.';
      if (!Number.isFinite(h) || h < LIMITES.dimensionMinM || h > LIMITES.dimensionMaxM) e.hauteurM = 'Hauteur entre 0,2 et 50 m.';
      if (!Number.isInteger(quantite) || quantite < 1 || quantite > LIMITES.quantiteMax) e.quantite = `Entre 1 et ${LIMITES.quantiteMax}.`;
      if (support === 'AUTRE' && !supportPrecision.trim()) e.supportPrecision = 'Précisez le support.';
      if (finitionEffective === 'AUTRE' && !finitionPrecision.trim()) e.finitionPrecision = 'Précisez la finition.';
      if (delai === 'DATE' && (!dateSouhaitee || dateSouhaitee < aujourdhui())) e.dateSouhaitee = 'Indiquez une date à venir.';
    }
    if (n === 2) {
      if (!prestation) e.prestation = 'Choisissez une prestation.';
      if (prestation === 'ACCOMPAGNEMENT' && commentaire.trim().length < 10) e.commentaire = 'Décrivez votre besoin en quelques mots.';
    }
    if (n === 3 && prestation === 'FICHIER_PRET' && fichiers.length === 0) {
      e.fichiers = 'Ajoutez votre fichier d’impression (une version allégée suffit si le fichier est très lourd).';
    }
    if (n === 5) {
      if (contact.nom.trim().length < 2) e.nom = 'Indiquez votre nom.';
      if (contact.telephone.replace(/\D/g, '').length < 9) e.telephone = 'Indiquez un numéro congolais (ex. 06 123 45 67).';
      if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim())) e.email = 'Adresse email invalide.';
      if (!consentement) e.consentement = 'Votre accord est nécessaire pour traiter la demande.';
    }
    return e;
  }

  function suivant() {
    const e = verifier(etape);
    setErreurs(e);
    if (Object.keys(e).length === 0) changerEtape(Math.min(etape + 1, ETAPES.length - 1));
  }

  function aller(n: number) {
    for (let i = 0; i < n; i += 1) {
      const e = verifier(i);
      if (Object.keys(e).length) {
        setErreurs(e);
        setEtape(i);
        return;
      }
    }
    setErreurs({});
    changerEtape(n);
  }

  /* ----------------------------------------------------------- sélection ---- */

  function choisirUsage(id: UsageId) {
    setUsage(id);
    const u = USAGES.find((x) => x.id === id)!;
    setModeleId(modelePrincipal(id).id);
    setSupport(u.supportDefaut);
    setLargeur(texteMetres(u.formatConseille.largeurM));
    setHauteur(texteMetres(u.formatConseille.hauteurM));
  }

  function choisirSupport(id: SupportId) {
    setSupport(id);
    const standard = supportParId(id)?.formatStandard;
    if (standard) {
      setLargeur(texteMetres(standard.largeurM));
      setHauteur(texteMetres(standard.hauteurM));
    }
  }

  function ajouterFichiers(liste: FileList | null) {
    if (!liste) return;
    const nouveaux = [...fichiers];
    const refus: string[] = [];
    for (const f of Array.from(liste)) {
      if (!TYPES_ACCEPTES.includes(f.type)) refus.push(`${f.name} : format non accepté.`);
      else if (f.size > MAX_FICHIER) refus.push(`${f.name} : plus de 25 Mo.`);
      else if (nouveaux.some((x) => x.name.toLowerCase() === f.name.toLowerCase())) refus.push(`${f.name} : déjà ajouté.`);
      else if (nouveaux.length >= MAX_FICHIERS) refus.push(`${f.name} : ${MAX_FICHIERS} fichiers au maximum.`);
      else if (nouveaux.reduce((s, x) => s + x.size, 0) + f.size > MAX_TOTAL) refus.push(`${f.name} : 50 Mo cumulés au maximum.`);
      else nouveaux.push(f);
    }
    setFichiers(nouveaux);
    setErreurs(refus.length ? { fichiers: refus.join(' ') } : {});
  }

  /* -------------------------------------------------------------- envoi ---- */

  async function envoyer() {
    const e = verifier(5);
    setErreurs(e);
    setErreurGlobale('');
    if (Object.keys(e).length) return;

    setEnvoi('Enregistrement de votre demande…');
    try {
      const r = await fetch('/api/banderoles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          ...parametres,
          contact,
          consentement,
          fichiers: fichiers.map((f) => ({ nom: f.name, typeMime: f.type, tailleOctets: f.size })),
        }),
      });
      const corps = (await r.json().catch(() => ({}))) as {
        reference?: string;
        uploads?: UploadSigne[];
        csrfToken?: string;
        erreur?: string;
        details?: Record<string, string>;
      };
      if (!r.ok || !corps.reference) {
        if (corps.details) {
          setErreurs(corps.details);
          const premiere = Object.keys(corps.details).map((c) => ETAPE_DU_CHAMP[c] ?? 5).sort((a, b) => a - b)[0];
          if (premiere !== undefined && premiere !== 5) setEtape(premiere);
        }
        setErreurGlobale(
          r.status === 429
            ? 'Trop de demandes envoyées depuis cette connexion. Réessayez dans une heure ou écrivez-nous sur WhatsApp.'
            : r.status === 503
              ? 'Le service est momentanément indisponible. Réessayez dans quelques minutes ou écrivez-nous sur WhatsApp.'
              : corps.erreur ?? 'La demande n’a pas pu être enregistrée.',
        );
        return;
      }
      if (corps.uploads?.length) {
        setEnvoi(`Envoi de vos fichiers (0/${corps.uploads.length})…`);
        await envoyerFichiersDevis({
          reference: corps.reference,
          csrfToken: corps.csrfToken ?? '',
          uploads: corps.uploads,
          fichiers,
          surProgression: (n, total) => setEnvoi(`Envoi de vos fichiers (${n}/${total})…`),
        });
      }
      setEnvoi('Demande enregistrée. Ouverture de votre suivi…');
      router.push(`/devis/${corps.reference}`);
    } catch (erreur) {
      setErreurGlobale(
        erreur instanceof Error
          ? `${erreur.message} Votre demande est enregistrée : vous pourrez ajouter vos fichiers depuis le suivi ou nous les envoyer sur WhatsApp.`
          : 'Erreur pendant l’envoi.',
      );
      setEnvoi(null);
    }
  }

  /* ------------------------------------------------------------- rendu ---- */

  const recap = usage ? (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <dt className="text-attenue">Support</dt>
      <dd className="text-right font-medium text-encre">{support === 'AUTRE' && supportPrecision ? supportPrecision : libelleSupport(support)}</dd>
      <dt className="text-attenue">Format</dt>
      <dd className="text-right font-medium text-encre">{dimensionsValides ? formatDimensions(l, h) : '—'}</dd>
      <dt className="text-attenue">Surface</dt>
      <dd className="text-right font-medium text-encre">{dimensionsValides ? `${formatSurface(surfaceM2(l, h))} × ${quantite}` : '—'}</dd>
      <dt className="text-attenue">Finition</dt>
      <dd className="text-right font-medium text-encre">{libelleFinition(finitionEffective)}</dd>
      <dt className="text-attenue">Délai</dt>
      <dd className="text-right font-medium text-encre">{libelleDelai(delai)}</dd>
      <dt className="text-attenue">Prestation</dt>
      <dd className="text-right font-medium text-encre">{prestation ? libellePrestation(prestation) : '—'}</dd>
    </dl>
  ) : null;

  const apercu = (
    <div className="rounded-3xl border border-filet bg-white p-4">
      <ApercuBanderole
        modele={modele}
        largeurM={dimensionsValides ? l : modele.format.largeurM}
        hauteurM={dimensionsValides ? h : modele.format.hauteurM}
        finition={finitionEffective}
        cadre={Math.min(2.2, Math.max(1.1, dimensionsValides ? l / h : 4 / 3))}
        className="w-full rounded-2xl bg-sable"
      />
      <p className="mt-3 text-center text-xs text-attenue">
        Aperçu indicatif aux proportions réelles{dimensionsValides ? ` — ${formatDimensions(l, h)}` : ''}. Le visuel final est validé avec vous.
      </p>
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0">
        {/* Progression */}
        <nav aria-label="Étapes de la commande">
          <ol className="flex gap-1.5">
            {ETAPES.map((nom, i) => (
              <li key={nom} className="flex-1">
                <button
                  type="button"
                  onClick={() => (i < etape ? aller(i) : undefined)}
                  disabled={i >= etape}
                  aria-current={i === etape ? 'step' : undefined}
                  className="group block w-full text-left disabled:cursor-default"
                >
                  <span className={`block h-1.5 rounded-full ${i < etape ? 'bg-encre' : i === etape ? 'bg-orange' : 'bg-filet'}`} />
                  <span className={`mt-2 hidden text-xs font-medium sm:block ${i === etape ? 'text-encre' : 'text-attenue'} ${i < etape ? 'group-hover:underline' : ''}`}>
                    {nom}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-6">
          <p className="text-sm text-attenue">
            Étape {etape + 1} sur {ETAPES.length}
          </p>
          {/* Focus programmatique pour les lecteurs d’écran : un titre n’est pas une commande, pas de contour. */}
          <h2 ref={titreEtape} tabIndex={-1} style={{ outline: 'none' }} className="mt-1 scroll-mt-28 font-display text-3xl text-encre sm:text-4xl">
            {
              [
                'Pour quelle occasion ?',
                'Les caractéristiques',
                'Quel accompagnement ?',
                'Vos fichiers et éléments',
                'Votre prix',
                'Vos coordonnées',
              ][etape]
            }
          </h2>
        </div>

        {erreurGlobale ? (
          <div className="mt-6 rounded-2xl border border-alerte/30 bg-orange/10 px-4 py-3 text-sm text-alerte" role="alert">
            {erreurGlobale}{' '}
            <a href={lienWhatsApp('Bonjour Elembo, je souhaite commander une banderole.')} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              WhatsApp
            </a>
          </div>
        ) : null}

        <div className="mt-6">
          {/* ------------------------------------------------ 1 · utilisation ---- */}
          {etape === 0 ? (
            <fieldset>
              <legend className="sr-only">Utilisation de la banderole</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {USAGES.map((u) => (
                  <label key={u.id} className={carte}>
                    <input type="radio" name="usage" value={u.id} checked={usage === u.id} onChange={() => choisirUsage(u.id)} className="sr-only" />
                    <ApercuBanderole modele={modelePrincipal(u.id)} cadre={2.4} className="w-full rounded-xl bg-sable" />
                    <span className="mt-3 font-semibold text-encre">{u.titre}</span>
                    <span className="mt-0.5 text-sm text-attenue">{u.accroche}</span>
                  </label>
                ))}
              </div>
              <Erreur message={erreurs.usage} />
            </fieldset>
          ) : null}

          {/* -------------------------------------------- 2 · caractéristiques ---- */}
          {etape === 1 && usage ? (
            <div className="space-y-8">
              <div className="lg:hidden">{apercu}</div>

              {modelesPour(usage).length > 1 ? (
                <fieldset>
                  <legend className={etiquette}>Modèle d’inspiration</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {modelesPour(usage).map((m) => (
                      <label key={m.id} className="cursor-pointer rounded-full border border-filet bg-white px-4 py-2 text-sm has-[:checked]:border-encre has-[:checked]:bg-encre has-[:checked]:text-creme has-[:focus-visible]:outline has-[:focus-visible]:outline-orange">
                        <input type="radio" name="modele" className="sr-only" checked={modele.id === m.id} onChange={() => setModeleId(m.id)} />
                        {m.nom}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <fieldset>
                <legend className={etiquette}>Support</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SUPPORTS.map((s) => (
                    <label key={s.id} className="cursor-pointer rounded-full border border-filet bg-white px-4 py-2 text-sm has-[:checked]:border-encre has-[:checked]:bg-encre has-[:checked]:text-creme has-[:focus-visible]:outline has-[:focus-visible]:outline-orange">
                      <input type="radio" name="support" className="sr-only" checked={support === s.id} onChange={() => choisirSupport(s.id)} />
                      {s.nom}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-sm text-attenue">{fiche?.description}</p>
                {support === 'AUTRE' ? (
                  <label className="mt-3 block">
                    <span className={etiquette}>Quel support ?</span>
                    <input value={supportPrecision} onChange={(e) => setSupportPrecision(e.target.value)} maxLength={200} placeholder="Drapeau, vitrophanie, tente…" className={champ} />
                    <Erreur message={erreurs.supportPrecision} />
                  </label>
                ) : null}
              </fieldset>

              <fieldset>
                <legend className={etiquette}>Dimensions (en mètres)</legend>
                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                  <label className="block">
                    <span className="text-sm text-attenue">Largeur</span>
                    <input inputMode="decimal" value={largeur} onChange={(e) => setLargeur(e.target.value)} aria-invalid={Boolean(erreurs.largeurM)} className={champ} />
                    <Erreur message={erreurs.largeurM} />
                  </label>
                  <span aria-hidden className="pt-10 text-attenue">×</span>
                  <label className="block">
                    <span className="text-sm text-attenue">Hauteur</span>
                    <input inputMode="decimal" value={hauteur} onChange={(e) => setHauteur(e.target.value)} aria-invalid={Boolean(erreurs.hauteurM)} className={champ} />
                    <Erreur message={erreurs.hauteurM} />
                  </label>
                </div>
                {FORMATS_RAPIDES[support] ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-attenue">Formats courants :</span>
                    {FORMATS_RAPIDES[support].map(([fl, fh]) => (
                      <button
                        key={`${fl}x${fh}`}
                        type="button"
                        onClick={() => {
                          setLargeur(texteMetres(fl));
                          setHauteur(texteMetres(fh));
                        }}
                        aria-pressed={l === fl && h === fh}
                        className="rounded-full border border-filet bg-white px-3 py-1 text-xs font-medium text-encre hover:border-encre aria-pressed:border-encre aria-pressed:bg-encre aria-pressed:text-creme"
                      >
                        {formatDimensions(fl, fh)}
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-attenue">Toutes les dimensions sont possibles, au centimètre près (ex. 2,5 × 0,8).</p>
              </fieldset>

              <div>
                <span className={etiquette} id="quantite-libelle">
                  Quantité
                </span>
                <div className="mt-2 inline-flex items-center rounded-full border border-encre/25 bg-white" role="group" aria-labelledby="quantite-libelle">
                  <button type="button" onClick={() => setQuantite((q) => Math.max(1, q - 1))} className="h-12 w-12 rounded-full text-xl" aria-label="Diminuer la quantité">
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={LIMITES.quantiteMax}
                    value={quantite}
                    onChange={(e) => setQuantite(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    aria-labelledby="quantite-libelle"
                    className="w-16 bg-transparent text-center text-lg font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button type="button" onClick={() => setQuantite((q) => Math.min(LIMITES.quantiteMax, q + 1))} className="h-12 w-12 rounded-full text-xl" aria-label="Augmenter la quantité">
                    +
                  </button>
                </div>
                <Erreur message={erreurs.quantite} />
              </div>

              {finitionsApplicables ? (
                <fieldset>
                  <legend className={etiquette}>Finition</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {FINITIONS.map((f) => (
                      <label key={f.id} className={carte}>
                        <input type="radio" name="finition" className="sr-only" checked={finition === f.id} onChange={() => setFinition(f.id)} />
                        <span className="font-semibold text-encre">{f.nom}</span>
                        <span className="mt-0.5 text-xs leading-relaxed text-attenue">{f.description}</span>
                      </label>
                    ))}
                  </div>
                  {finition === 'AUTRE' ? (
                    <label className="mt-3 block">
                      <span className={etiquette}>Quelle finition ?</span>
                      <input value={finitionPrecision} onChange={(e) => setFinitionPrecision(e.target.value)} maxLength={200} className={champ} />
                      <Erreur message={erreurs.finitionPrecision} />
                    </label>
                  ) : null}
                </fieldset>
              ) : (
                <p className="rounded-2xl bg-sable px-4 py-3 text-sm text-attenue">
                  Le {libelleSupport(support).toLowerCase()} est livré monté : pas de finition à choisir.
                </p>
              )}

              <fieldset>
                <legend className={etiquette}>Délai souhaité</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {DELAIS.map((d) => (
                    <label key={d.id} className={carte}>
                      <input type="radio" name="delai" className="sr-only" checked={delai === d.id} onChange={() => setDelai(d.id)} />
                      <span className="font-semibold text-encre">{d.nom}</span>
                      <span className="mt-0.5 text-xs leading-relaxed text-attenue">{d.description}</span>
                    </label>
                  ))}
                </div>
                {delai === 'DATE' ? (
                  <label className="mt-3 block max-w-xs">
                    <span className={etiquette}>Date de l’événement</span>
                    <input type="date" min={aujourdhui()} value={dateSouhaitee} onChange={(e) => setDateSouhaitee(e.target.value)} className={champ} />
                    <Erreur message={erreurs.dateSouhaitee} />
                  </label>
                ) : null}
              </fieldset>

              <label className="block">
                <span className={etiquette}>Commentaire (facultatif)</span>
                <textarea
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  maxLength={LIMITES.commentaireMax}
                  rows={3}
                  placeholder="Textes à faire figurer, lieu d’installation (intérieur / extérieur), couleurs…"
                  className={champ}
                />
                <Erreur message={erreurs.commentaire} />
              </label>
            </div>
          ) : null}

          {/* ------------------------------------------------- 3 · prestation ---- */}
          {etape === 2 ? (
            <fieldset>
              <legend className="sr-only">Type de prestation</legend>
              <div className="grid gap-3">
                {PRESTATIONS.map((p) => (
                  <label key={p.id} className={carte}>
                    <input type="radio" name="prestation" className="sr-only" checked={prestation === p.id} onChange={() => setPrestation(p.id)} />
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-display text-xl text-encre">{p.nom}</span>
                      <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full border border-encre/30 text-creme [label:has(:checked)_&]:border-encre [label:has(:checked)_&]:bg-encre">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </span>
                    <span className="mt-1 text-sm text-attenue">{p.description}</span>
                    <span className="mt-1 text-xs text-attenue">{p.aide}</span>
                  </label>
                ))}
              </div>
              <Erreur message={erreurs.prestation} />
              {prestation === 'ACCOMPAGNEMENT' ? (
                <label className="mt-5 block">
                  <span className={etiquette}>Décrivez votre besoin</span>
                  <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} maxLength={LIMITES.commentaireMax} rows={4} className={champ} placeholder="L’occasion, le lieu, ce que vous voulez faire passer…" />
                  <Erreur message={erreurs.commentaire} />
                </label>
              ) : null}
            </fieldset>
          ) : null}

          {/* --------------------------------------------------- 4 · fichiers ---- */}
          {etape === 3 ? (
            <div>
              <p className="text-sm leading-relaxed text-attenue">
                {prestation === 'FICHIER_PRET'
                  ? 'Ajoutez votre fichier prêt à imprimer. Il sera contrôlé avant production.'
                  : prestation === 'CREATION'
                    ? 'Ajoutez photos, logos, textes ou un visuel existant : notre studio s’en sert pour composer votre banderole.'
                    : 'Ajoutez des documents de référence si vous en avez (facultatif).'}
              </p>
              <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-encre/25 bg-white px-6 py-10 text-center transition-colors hover:border-encre has-[:focus-visible]:outline has-[:focus-visible]:outline-orange">
                <span className="font-semibold text-encre">Choisir des fichiers</span>
                <span className="mt-1 text-sm text-attenue">PDF, PNG, JPEG, WEBP ou ZIP · 25 Mo par fichier · 5 fichiers et 50 Mo au total</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.zip"
                  onChange={(e) => {
                    ajouterFichiers(e.target.files);
                    e.target.value = '';
                  }}
                  className="sr-only"
                />
              </label>
              <Erreur message={erreurs.fichiers} />
              {fichiers.length ? (
                <ul className="mt-4 divide-y divide-filet rounded-2xl border border-filet bg-white">
                  {fichiers.map((f) => (
                    <li key={f.name} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-encre">{f.name}</span>
                        <span className="text-xs text-attenue">{taille(f.size)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setFichiers((liste) => liste.filter((x) => x !== f))}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-sable"
                        aria-label={`Retirer ${f.name}`}
                      >
                        <Close className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-4 text-xs leading-relaxed text-attenue">
                Vos fichiers sont déposés dans un espace privé, consultable uniquement par l’équipe Smart Vision qui traite votre demande.
                Fichier plus lourd ? Envoyez une version allégée : nous récupérerons la version haute définition avec vous.
              </p>
            </div>
          ) : null}

          {/* ------------------------------------------------------- 5 · prix ---- */}
          {etape === 4 ? (
            <div aria-live="polite">
              {estimation.etat === 'chargement' || estimation.etat === 'inactif' ? (
                <div className="rounded-3xl border border-filet bg-white p-6 text-sm text-attenue">Calcul de votre estimation…</div>
              ) : estimation.etat === 'pret' && estimation.resultat.disponible ? (
                <div className="rounded-3xl bg-encre p-6 text-creme sm:p-8">
                  <p className="surtitre text-orange">Estimation indicative</p>
                  <p className="mt-3 font-display text-5xl tracking-tight">{fcfa(estimation.resultat.montantFcfa)}</p>
                  <dl className="mt-6 grid gap-2 border-t border-creme/15 pt-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-creme/70">
                        Impression · {estimation.resultat.quantite} × {fcfa(estimation.resultat.prixPieceFcfa)}
                      </dt>
                      <dd>{fcfa(estimation.resultat.impressionFcfa)}</dd>
                    </div>
                    {estimation.resultat.creationFcfa ? (
                      <div className="flex justify-between gap-4">
                        <dt className="text-creme/70">Création graphique</dt>
                        <dd>{fcfa(estimation.resultat.creationFcfa)}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-4">
                      <dt className="text-creme/70">Surface totale</dt>
                      <dd>{formatSurface(estimation.resultat.surfaceTotaleM2)}</dd>
                    </div>
                  </dl>
                  <p className="mt-5 text-xs leading-relaxed text-creme/60">
                    Hors livraison. Ce montant est calculé sur la grille validée par Smart Vision ; il est confirmé dans votre devis après
                    contrôle des fichiers et du délai. Le paiement MTN Mobile Money intervient une fois le devis accepté.
                  </p>
                </div>
              ) : (
                <div className="rounded-3xl border border-encre bg-sable p-6 sm:p-8">
                  <p className="surtitre text-orange-action">Prix sur devis</p>
                  <p className="mt-3 font-display text-3xl text-encre">Nous vous envoyons un devis personnalisé.</p>
                  <p className="mt-3 text-sm leading-relaxed text-attenue">
                    {estimation.etat === 'pret' && !estimation.resultat.disponible ? estimation.resultat.message : estimation.etat === 'indisponible' ? estimation.message : ''}
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-attenue">
                    {['Gratuit et sans engagement', 'Prix, délai et maquette confirmés par Smart Vision', 'Aucun paiement à cette étape'].map((p) => (
                      <li key={p} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}

          {/* ------------------------------------------------ 6 · confirmation ---- */}
          {etape === 5 ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={etiquette}>Nom complet *</span>
                  <input autoComplete="name" value={contact.nom} onChange={(e) => setContact({ ...contact, nom: e.target.value })} maxLength={160} className={champ} />
                  <Erreur message={erreurs.nom} />
                </label>
                <label className="block">
                  <span className={etiquette}>Téléphone (MTN / Airtel) *</span>
                  <input autoComplete="tel" inputMode="tel" value={contact.telephone} onChange={(e) => setContact({ ...contact, telephone: e.target.value })} placeholder="06 123 45 67" className={champ} />
                  <Erreur message={erreurs.telephone} />
                </label>
                <label className="block">
                  <span className={etiquette}>Email</span>
                  <input type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className={champ} />
                  <Erreur message={erreurs.email} />
                </label>
                <label className="block">
                  <span className={etiquette}>Église, entreprise ou organisation</span>
                  <input autoComplete="organization" value={contact.societe} onChange={(e) => setContact({ ...contact, societe: e.target.value })} maxLength={160} className={champ} />
                </label>
                <label className="block sm:col-span-2">
                  <span className={etiquette}>Ville de livraison</span>
                  <input value={contact.ville} onChange={(e) => setContact({ ...contact, ville: e.target.value })} maxLength={120} className={champ} />
                </label>
              </div>

              <div className="rounded-2xl border border-filet bg-white p-5 lg:hidden">{recap}</div>

              <label className="flex items-start gap-3 text-sm text-encre">
                <input type="checkbox" checked={consentement} onChange={(e) => setConsentement(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--color-encre)]" />
                <span>J’accepte que Smart Vision utilise ces informations et mes fichiers pour traiter ma demande.</span>
              </label>
              <Erreur message={erreurs.consentement} />
            </div>
          ) : null}
        </div>

        {/* Navigation */}
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-8 border-t border-filet bg-creme/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-4 lg:backdrop-blur-none">
          {envoi ? (
            <p className="mb-3 text-sm font-medium text-encre" role="status">
              {envoi}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            {etape > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setErreurs({});
                  changerEtape(etape - 1);
                }}
                disabled={Boolean(envoi)}
                className="rounded-full border border-encre px-5 py-3.5 text-sm font-semibold text-encre disabled:opacity-50"
              >
                Retour
              </button>
            ) : (
              <Link href="/banderoles" className="rounded-full border border-encre px-5 py-3.5 text-sm font-semibold text-encre">
                Retour
              </Link>
            )}
            {etape < ETAPES.length - 1 ? (
              <button type="button" onClick={suivant} className="group inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-encre px-6 py-3.5 text-sm font-semibold text-creme transition-colors hover:bg-orange hover:text-encre sm:flex-none">
                Continuer
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void envoyer()}
                disabled={Boolean(envoi)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-orange px-6 py-3.5 text-sm font-semibold text-encre transition-colors hover:bg-encre hover:text-creme disabled:opacity-60 sm:flex-none"
              >
                {estimation.etat === 'pret' && estimation.resultat.disponible ? 'Envoyer ma commande' : 'Demander mon devis'}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
          {etape === ETAPES.length - 1 ? (
            <p className="mt-3 text-xs text-attenue">Aucun paiement maintenant : Smart Vision valide votre demande et vous envoie le devis.</p>
          ) : null}
        </div>
      </div>

      {/* Colonne latérale (bureau) */}
      <aside className="hidden space-y-4 lg:sticky lg:top-32 lg:block">
        {apercu}
        {recap ? (
          <div className="rounded-3xl border border-filet bg-white p-5">
            <p className="surtitre text-orange-action">Votre banderole</p>
            <div className="mt-3">{recap}</div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
