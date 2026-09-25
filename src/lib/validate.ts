// Règles de validation d'upload (fonctions pures, testées).
// Format défini par la plateforme : PNG/JPG, ≤ 10 Mo, dimensions ≥ 500 px.

export type ValidationResult = { ok: boolean; reason?: string };

export const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo
export const MIN_DIMENSION = 500; // px
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg'] as const;

export function validateFile(sizeBytes: number, mimeType: string): ValidationResult {
  const type = (mimeType || '').toLowerCase().trim();
  if (!(ACCEPTED_TYPES as readonly string[]).includes(type)) {
    return { ok: false, reason: 'Format non supporté : utilisez un fichier PNG ou JPG.' };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, reason: 'Fichier vide ou illisible.' };
  }
  if (sizeBytes > MAX_SIZE_BYTES) {
    return { ok: false, reason: 'Fichier trop volumineux : 10 Mo maximum.' };
  }
  return { ok: true };
}

export function validateDimensions(w: number, h: number): ValidationResult {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { ok: false, reason: 'Image illisible : dimensions invalides.' };
  }
  if (w < MIN_DIMENSION || h < MIN_DIMENSION) {
    return {
      ok: false,
      reason: `Résolution trop faible : ${Math.round(w)}×${Math.round(h)} px — minimum ${MIN_DIMENSION}×${MIN_DIMENSION} px.`,
    };
  }
  return { ok: true };
}
