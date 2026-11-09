export type FamilleDevis = 'TEXTILE' | 'TABLEAUX' | 'IMPRESSION' | 'SERVICES';
export type StatutDevis = 'NOUVEAU' | 'EN_ANALYSE' | 'PROPOSE' | 'ACCEPTE' | 'REFUSE' | 'EXPIRE';
export type StatutAnalyse = 'NON_ANALYSE' | 'EN_ATTENTE' | 'PROPRE' | 'INFECTE' | 'ERREUR';

export type FichierAnnonce = {
  nom: string;
  typeMime: string;
  tailleOctets: number;
};

export type DemandeDevis = {
  famille: FamilleDevis;
  nom: string;
  societe?: string;
  email?: string;
  telephone: string;
  telephoneNormalise: string;
  typeClient: 'PARTICULIER' | 'ENTREPRISE' | 'ASSOCIATION' | 'ECOLE' | 'AUTRE';
  ville?: string;
  besoin: string;
  format?: string;
  quantite?: number;
  specifications: Record<string, unknown>;
  fichiers: FichierAnnonce[];
  consentement: true;
};

export type UploadDevis = {
  fichierId: string;
  nom: string;
  chemin: string;
  signedUrl: string;
  token: string;
};

export type CreationDevis = {
  reference: string;
  suiviToken?: string;
  uploads: UploadDevis[];
  csrfToken?: string;
  dejaExistant: boolean;
};

export type DevisPublic = {
  reference: string;
  statut: StatutDevis;
  famille: FamilleDevis;
  besoin: string;
  format: string | null;
  quantite: number | null;
  montantProposeFcfa: number | null;
  creeLe: string;
  expireLe: string | null;
  fichiers: {
    id: string;
    nom: string;
    typeMime: string;
    tailleOctets: number;
    verifie: boolean;
    statutAnalyse: StatutAnalyse;
  }[];
};
