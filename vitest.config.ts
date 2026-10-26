import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Le code serveur (src/server/momo) est importé par les routes Next via l'alias `@/`.
  // Sans cet alias, les tests échouent au chargement du module — pas sur une assertion,
  // mais avant d'exécuter quoi que ce soit : le symptôme est « 0 test » et un « Cannot find
  // package '@/…' ». Les deux résolutions doivent rester alignées avec tsconfig.json.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
