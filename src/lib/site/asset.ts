/** Préfixe un chemin public avec le basePath du déploiement (GitHub Pages). */
export function asset(chemin: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${chemin}`;
}
