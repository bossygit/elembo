// GÉNÉRÉ par scripts/polices-banner.py — ne pas modifier à la main.
// Source : google/fonts@6ebe737e44fd64ee736bbc6feed6136a6dbfd222

import type { MetriquesPolice } from './layout';

/** Variante réelle d'une police : graisse, suivie de `i` pour l'italique. */
export type Variante = '400' | '700' | '400i' | '700i';
export type PoliceBanner = { id: string; nom: string; categorie: 'sans' | 'display' | 'script' | 'serif'; licence: string; variantes: Variante[] };

export const POLICES_BANNER: PoliceBanner[] = [
  { id: 'montserrat', nom: 'Montserrat', categorie: 'sans', licence: 'OFL-1.1', variantes: ['400', '700', '400i', '700i'] },
  { id: 'poppins', nom: 'Poppins', categorie: 'sans', licence: 'OFL-1.1', variantes: ['400', '700', '400i', '700i'] },
  { id: 'bebas-neue', nom: 'Bebas Neue', categorie: 'sans', licence: 'OFL-1.1', variantes: ['400'] },
  { id: 'oswald', nom: 'Oswald', categorie: 'sans', licence: 'OFL-1.1', variantes: ['400', '700'] },
  { id: 'anton', nom: 'Anton', categorie: 'sans', licence: 'OFL-1.1', variantes: ['400'] },
  { id: 'archivo-black', nom: 'Archivo Black', categorie: 'sans', licence: 'OFL-1.1', variantes: ['400'] },
  { id: 'bangers', nom: 'Bangers', categorie: 'display', licence: 'OFL-1.1', variantes: ['400'] },
  { id: 'righteous', nom: 'Righteous', categorie: 'display', licence: 'OFL-1.1', variantes: ['400'] },
  { id: 'russo-one', nom: 'Russo One', categorie: 'display', licence: 'OFL-1.1', variantes: ['400'] },
  { id: 'alfa-slab-one', nom: 'Alfa Slab One', categorie: 'display', licence: 'OFL-1.1', variantes: ['400'] },
  { id: 'pacifico', nom: 'Pacifico', categorie: 'script', licence: 'OFL-1.1', variantes: ['400'] },
  { id: 'lobster', nom: 'Lobster', categorie: 'script', licence: 'OFL-1.1', variantes: ['400'] },
  { id: 'caveat', nom: 'Caveat', categorie: 'script', licence: 'OFL-1.1', variantes: ['400', '700'] },
  { id: 'permanent-marker', nom: 'Permanent Marker', categorie: 'script', licence: 'Apache-2.0', variantes: ['400'] },
  { id: 'great-vibes', nom: 'Great Vibes', categorie: 'script', licence: 'OFL-1.1', variantes: ['400'] },
  { id: 'playfair-display', nom: 'Playfair Display', categorie: 'serif', licence: 'OFL-1.1', variantes: ['400', '700', '400i', '700i'] },
  { id: 'bodoni-moda', nom: 'Bodoni Moda', categorie: 'serif', licence: 'OFL-1.1', variantes: ['400', '700', '400i', '700i'] },
  { id: 'dm-serif-display', nom: 'DM Serif Display', categorie: 'serif', licence: 'OFL-1.1', variantes: ['400', '400i'] },
  { id: 'cinzel', nom: 'Cinzel', categorie: 'serif', licence: 'OFL-1.1', variantes: ['400', '700'] },
  { id: 'cormorant-garamond', nom: 'Cormorant Garamond', categorie: 'serif', licence: 'OFL-1.1', variantes: ['400', '700', '400i', '700i'] },
];

/** Métriques verticales (table hhea), en em. */
export const METRIQUES: Record<string, Partial<Record<Variante, MetriquesPolice>>> = {
  'montserrat': { '400': { ascendante: 0.968, descendante: -0.251 }, '700': { ascendante: 0.968, descendante: -0.251 }, '400i': { ascendante: 0.968, descendante: -0.251 }, '700i': { ascendante: 0.968, descendante: -0.251 } },
  'poppins': { '400': { ascendante: 1.05, descendante: -0.35 }, '700': { ascendante: 1.05, descendante: -0.35 }, '400i': { ascendante: 1.05, descendante: -0.35 }, '700i': { ascendante: 1.05, descendante: -0.35 } },
  'bebas-neue': { '400': { ascendante: 0.9, descendante: -0.3 } },
  'oswald': { '400': { ascendante: 1.193, descendante: -0.289 }, '700': { ascendante: 1.193, descendante: -0.289 } },
  'anton': { '400': { ascendante: 1.17627, descendante: -0.329102 } },
  'archivo-black': { '400': { ascendante: 0.878, descendante: -0.21 } },
  'bangers': { '400': { ascendante: 0.883, descendante: -0.181 } },
  'righteous': { '400': { ascendante: 0.984863, descendante: -0.256836 } },
  'russo-one': { '400': { ascendante: 0.926, descendante: -0.279 } },
  'alfa-slab-one': { '400': { ascendante: 1.036, descendante: -0.333 } },
  'pacifico': { '400': { ascendante: 1.303, descendante: -0.453 } },
  'lobster': { '400': { ascendante: 1.0, descendante: -0.25 } },
  'caveat': { '400': { ascendante: 0.96, descendante: -0.3 }, '700': { ascendante: 0.96, descendante: -0.3 } },
  'permanent-marker': { '400': { ascendante: 1.109375, descendante: -0.317383 } },
  'great-vibes': { '400': { ascendante: 0.851, descendante: -0.401 } },
  'playfair-display': { '400': { ascendante: 1.082, descendante: -0.251 }, '700': { ascendante: 1.082, descendante: -0.251 }, '400i': { ascendante: 1.082, descendante: -0.251 }, '700i': { ascendante: 1.082, descendante: -0.251 } },
  'bodoni-moda': { '400': { ascendante: 1.125, descendante: -0.4 }, '700': { ascendante: 1.125, descendante: -0.4 }, '400i': { ascendante: 1.125, descendante: -0.4 }, '700i': { ascendante: 1.125, descendante: -0.4 } },
  'dm-serif-display': { '400': { ascendante: 1.036, descendante: -0.335 }, '400i': { ascendante: 1.036, descendante: -0.335 } },
  'cinzel': { '400': { ascendante: 0.976, descendante: -0.372 }, '700': { ascendante: 0.976, descendante: -0.372 } },
  'cormorant-garamond': { '400': { ascendante: 0.924, descendante: -0.287 }, '700': { ascendante: 0.924, descendante: -0.287 }, '400i': { ascendante: 0.924, descendante: -0.287 }, '700i': { ascendante: 0.924, descendante: -0.287 } },
};

/** Caractères présents dans **toutes** les variantes, en plages hexadécimales. */
export const COUVERTURE: Record<string, string> = {
  'montserrat': '20-7e a0-ac ae-183 186-18c 18e-194 196-1a1 1a4-1a6 1a9 1ac-1b9 1c0-1f5 1f8-220 222-223 226-233 237 23a-23e 241-251 253-254 256-259 25b-25c 25f-260 263-266 268-26c 26f 271-272 274-275 27d-27e 280 283 287-28c 28e 292 294-295 298 29d 2b0 2b7-2c1 2c6-2cc 2d7-2dd 2ec 2ee 2fb-2fc 300-304 306-30d 30f-313 315 31b 320 323-329 32d-332 334-338 34f 358 35c-35d 35f 361-362 1e00-1e9b 1e9e 1ea0-1ef9 2007-200b 2010 2012-2015 2018-201a 201c-201e 2020-2022 2026 2030 2032-2033 2039-203a 2044 2052 2070-2071 2074-2079 207f-2089 20a1 20a3-20a4 20a6-20a7 20a9 20ab-20ae 20b1-20b2 20b4-20b5 20b8-20ba 20bc-20bd 20bf 2113 2116 2122 2126 212a-212b 212e 2144 2153-2154 215b-215e 2183-2184 2190-2199 2202 2205-2206 220f 2211-2212 2215 2219-221a 221e 222b 2248 2260 2264-2265 25a0-25a1 25b2-25b3 25b6-25b7 25bc-25bd 25c0-25c1 25c6-25c7 25ca 25cc a726-a727 a740-a741 a789-a78d a792-a793 a7a8-a7ab a7ad-a7ae a7b1-a7b9 a7c7-a7c8 a7cb-a7cd a7da-a7dc fb01-fb02',
  'poppins': '20-7e a0-107 10a-11b 11e-123 128-131 136-137 139-148 14c-15b 15e-165 168-17e 18f 192 1fc-1fd 218-21b 259 2bc 2c6-2c7 2c9 2d8-2dd 1e80-1e85 1ebc-1ebd 1ef2-1ef3 1ef8-1ef9 200c-200d 2013-2014 2018-201a 201c-201e 2020-2022 2026 2030 2039-203a 2044 20a8 20ac 20b9-20ba 20bd 2113 2122 2126 212e 2202 2206 220f 2211-2212 2215 2219-221a 221e 222b 2248 2260 2264-2265 25ca 25cc fb01-fb02',
  'bebas-neue': '20-7e a0-17e 192 1fc-1ff 218-21b 237 2bc 2c6-2c7 2c9 2d8-2dd 300-304 306-308 30a-30c 312 326-328 335-338 1e02-1e03 1e0a-1e0b 1e1e-1e1f 1e40-1e41 1e56-1e57 1e60-1e61 1e6a-1e6b 1e80-1e85 1e9e 1ef2-1ef3 2002-2003 2007-2008 200b 2012-2014 2018-201a 201c-201e 2020-2022 2026 2030 2039-203a 2044 2070 2074-2079 2080-2089 20ac 20b9 20bf 2113 2116-2117 2120 2122 2126 212e 2153-2154 215b-215e 2202 2205-2206 220f 2211-2212 2215 2219-221a 221e 222b 2248 2260 2264-2265 25ca-25cb',
  'oswald': '20-7e a0-ac ae-17f 18f 192 1a0-1a1 1af-1b0 1b7 1c4-1ce 1d3-1d4 1e4-1eb 1ee-1ef 1f1-1f5 1fa-21b 21e-21f 22a-22d 230-233 237 259 292 2bb-2bc 2c6-2c7 2c9 2d8-2dd 300-304 306-30c 30f 311-312 31b 323-324 326-328 32e 331 335 1e02-1e03 1e0a-1e0b 1e1e-1e1f 1e40-1e41 1e56-1e57 1e60-1e61 1e6a-1e6b 1e80-1e85 1e9e 1ea0-1ef9 2010 2013-2014 2018-201a 201c-201e 2020-2022 2026 2030 2032-2033 2039-203a 2044 2052 2074 20a1 20a3-20a4 20a6-20a7 20a9 20ab-20ae 20b1-20b2 20b4-20b5 20b8-20ba 20bc-20bd 2113 2116 2122 212a-212b 212e 2202 2205 220f 2211-2212 2215 2219-221a 221e 222b 2248 2260 2264-2265 25ca fb01-fb02',
  'anton': '20-7e a0-181 186-18a 18e-194 196-1a1 1a4-1a5 1a9 1ac-1b9 1c0-1f5 1f8-21b 21e-220 222-223 226-233 237 23a-23e 241-24f 251 253-254 256-257 259 25b 260 263 265-266 268-26c 26f 272 275 27d-27e 283 288-28c 292 294-295 298 29d 2b0 2b7 2b9-2bc 2be-2c0 2c6-2cc 2d7-2dd 2ee 300-304 306-30d 30f-313 31b 323-329 32d-332 334-335 358 1e00-1e95 1e97 1e9e 1ea0-1ef9 2007-200b 2010 2012-2015 2018-201a 201c-201e 2020-2022 2026 2030 2032-2033 2039-203a 2044 2052 2070 2074-2079 2080-2089 20a1 20a3-20a4 20a6-20a7 20a9 20ab-20ad 20b1-20b2 20b5 20b9-20ba 20bc-20bd 2113 2116 2122 2126 212e 2153-2154 215b-215e 2190-2193 2202 2205-2206 220f 2211-2212 2215 2219-221a 221e 222b 2248 2260 2264-2265 25a0-25a1 25b2-25b3 25b6-25b7 25bc-25bd 25c0-25c1 25c6-25c7 25ca a726-a727 a740-a741 a789-a78d a7a8-a7aa a7ad-a7ae a7b2-a7b9 fb01-fb02',
  'archivo-black': '20-7e a0-17f 192 1fa-1ff 218-21b 2c6-2c7 2c9 2d8-2dd 326 1e80-1e85 1ef2-1ef3 2013-2015 2017-201e 2020-2022 2026 2030 2032-2033 2039-203a 203c 203e 2044 207f 20a3-20a4 20a7 20ac 2105 2113 2116 2122 2126 212e 215b-215e 2190-2195 21a8 2202 2206 220f 2211-2212 2215 2219-221a 221e-221f 2229 222b 2248 2260-2261 2264-2265 25ca fb01-fb02',
  'bangers': '20-7e a0-ac ae-17e 18f 192 19d 1a0-1a1 1af-1b0 1c4-1cc 1e6-1e7 1ea-1eb 1fa-21b 22a-22d 230-233 237 259 272 2c6-2c7 2c9 2d8-2dd 300-304 306-30c 30f 311-312 31b 323-324 326-328 32e 331 1e80-1e85 1e9e 1ea0-1ef9 2013-2014 2018-201a 201c-201e 2020-2022 2026 2030 2039-203a 2044 2074 20a1 20a3-20a4 20a6-20a7 20a9 20ab-20ad 20b1-20b2 20b5 20b9-20ba 20bc-20bd 2116 2122 220f 2212 2215 2219-221a 2248 2260 2264-2265',
  'righteous': '20-7e a0-17e 1fc-1ff 237 2c6-2c7 2d8-2dd 312 315 326 1e80-1e85 1ef2-1ef3 2013-2014 2018-201a 201c-201e 2020-2022 2026 2030 2039-203a 2044 20ac 2122 2202 220f 2212 221e 2248 2260 fb01-fb02',
  'russo-one': '20-7e a0-107 10c-113 116-11b 11e-11f 122-123 127-12b 12e-131 133-13e 140-148 14c-14d 150-15b 15e-165 16a-16b 16e-173 178-17e 192 218-219 2c6-2c7 2d8-2dd 2013-2014 2018-201a 201c-201e 2020-2022 2026 2030 2039-203a 2070 2074 20ac 2116 2122',
  'alfa-slab-one': '20-7e a0-17e 18f 192 1a0-1a1 1af-1b0 1c4-1cc 1e6-1e7 1ea-1eb 1fa-21b 22a-22d 230-233 237 259 2bb-2bc 2be-2bf 2c6-2cc 2d8-2dd 300-304 306-30c 30f 311-312 31b 323-324 326-328 32e 331 335 1e08-1e09 1e0c-1e0f 1e14-1e17 1e1c-1e1d 1e20-1e21 1e24-1e25 1e2a-1e2b 1e2e-1e2f 1e36-1e37 1e3a-1e3b 1e42-1e49 1e4c-1e53 1e5a-1e5b 1e5e-1e69 1e6c-1e6f 1e78-1e7b 1e80-1e85 1e8e-1e8f 1e92-1e93 1e97 1e9e 1ea0-1ef9 2007-200b 2010 2012-2015 2018-201a 201c-201e 2020-2022 2026 2030 2032-2033 2039-203a 2044 2070 2074-2079 2080-2089 20a1 20a3-20a4 20a6-20a7 20a9 20ab-20ad 20b1-20b2 20b5 20b9-20ba 20bc-20bd 2113 2116 2122 2126 212e 2202 2205-2206 220f 2211-2212 2215 2219-221a 221e 222b 2248 2260 2264-2265 25ca fb01-fb02',
  'pacifico': '20-7e a0-131 134-17e 18f 192 1a0-1a1 1af-1b0 1c4-1cc 1e6-1e7 1ea-1eb 1fa-21b 22a-22d 230-233 237 259 2bc 2c6-2c7 2c9 2d8-2dd 300-304 306-30c 30f 311-312 31b 323-324 326-328 32e 331 1e80-1e85 1e9e 1ea0-1ef9 2013-2014 2018-201a 201c-201e 2020-2022 2026 2030 2039-203a 2044 2074 20a1 20a3-20a4 20a6-20a7 20a9 20ab-20ae 20b1-20b2 20b4-20b5 20b8-20ba 20bc-20bd 2116 2122 2202 220f 2211-2212 2215 2219-221a 221e 222b 2248 2260 2264-2265 25ca fb01-fb02',
  'lobster': '20-7e a0-17f 18f 192 1a0-1a1 1af-1b0 1b7 1cd-1dc 1e4-1eb 1ee-1ef 1f4-1f5 1fa-21b 21e-21f 237 259 292 2bb-2bc 2c6-2c7 2c9-2cb 2d8-2dd 300-304 306-30c 30f 311 31b 323-324 326-328 32e 331 335 1e0c-1e0d 1e20-1e21 1e24-1e25 1e2a-1e2b 1e36-1e37 1e42-1e47 1e5a-1e5b 1e60-1e63 1e6c-1e6d 1e80-1e85 1e8e-1e8f 1e92-1e93 1e97 1e9e 1ea0-1ef9 2010 2013-2014 2018-201a 201c-201e 2020-2022 2026 2030 2032-2033 2039-203a 2044 2052 2070 2074-2079 2080-2089 20a1 20a3-20a4 20a6 20a9 20ac 20ae 20b3-20b4 20b8-20ba 20bd 2116 2120 2122 2126 212a-212b 212e 2153-2154 215b-215e 2202 2206 220f 2211-2212 2215 2219-221a 221e 222b 2248 2260 2264-2265 25ca fb00-fb04',
  'caveat': '20-7e a0-17e 18f 192 1c4-1cc 1d4 1e5 1e7 1e9-1eb 1ef 1f1-1f5 1fa-21b 21f 237 259 292 2bc 2c6-2c7 2c9 2d8-2dd 300-304 306-308 30a-30c 30f 311 323 326-328 335 1e0c-1e0d 1e24-1e25 1e44-1e45 1e5a-1e5b 1e62-1e63 1e6c-1e6d 1e80-1e85 1e92-1e93 1eb8-1eb9 1ebc-1ebd 1eca-1ecd 1ee4-1ee5 1ef2-1ef3 1ef8-1ef9 2010 2013-2014 2018-201a 201c-201e 2020-2022 2026 2030 2032-2033 2039-203a 2044 2052 2070 2074-2079 2080-2089 20a1 20a3-20a4 20a6 20a9 20ac 20ae 20b4 20b8-20ba 20bd 2116 2120 2122 2153-2154 215b-215e 2212 2215 2219 2248 2260 2264-2265 fb00-fb04',
  'permanent-marker': '20-7e a0-ff 131 141-142 152-153 160-161 178 17d-17e 2c6-2c7 2d8-2dd 2013-2014 2018-201a 201c-201e 2022 2026 2030 2039-203a 2044 20ac 2206 2212 2248 fb01-fb02',
  'great-vibes': '20-7e a0-ac ae-148 14a-17e 180-181 186-18a 18e-194 196-1a1 1a4-1a5 1a9 1ac-1b9 1c0-1c7 1c9-1ca 1cc-1f0 1f4-1f5 1f8-21b 21e-220 222-223 226-233 237 23a-23e 241-24f 251 253-254 256-257 259 25b 25f-260 263-266 268-26c 26f 272 275 27d 283 288-28c 292 294-295 298 29d 2b0 2b7 2b9-2bc 2be-2c0 2c6-2c8 2ca-2cb 2d7-2dd 2ee 300-304 306-30d 30f-313 315 31b 320 323-329 32d-332 334-336 358 35f 1e00-1e95 1e9e 1ea0-1ef9 2000-200b 2010-2011 2013-2015 2018-201a 201c-201e 2020-2022 2026 202f-2030 2032-2033 2039-203a 2044 2052 205f 2070-2071 2074-2079 207f-2089 20a1 20a3-20a4 20a6-20a7 20a9 20ab-20ae 20b1-20b2 20b4-20b5 20b8-20ba 20bc-20bd 2116 2122 2126 2150-2154 2159-215e 2202 2206 220f 2211-2212 2215 2219-221a 221e 222b 2248 2260 2264-2265 25ca a726-a727 a740-a741 a789-a78d a7a8-a7aa a7ad-a7ae a7b2-a7b9 a7da-a7dc fb01-fb02',
  'playfair-display': '20-7e a0-b4 b6-17f 18f 192 1a0-1a1 1af-1b0 1b7 1cd-1ce 1d3-1d4 1e4-1e9 1ee-1ef 1f4-1f5 1fe-1ff 218-21b 21e-21f 237 259 292 2bb-2bc 2c6-2c7 2d8-2dd 300-304 306-30c 323 326-328 335 337-338 1e80-1e85 1e9e 1ea0-1ef9 2009 2010 2013-2014 2018-201a 201c-201e 2020-2022 2026 2030 2032-2033 2039-203a 2044 2052 20ac 20b9 2105 2116 2122 212a-212b 2153-2154 2190-2194 2196-2199 2202 220f 2211-2212 221a 221e 222b 2248 2260 2264-2265 25a0-25a1 25ca fb01-fb02',
  'bodoni-moda': '20-7e a0-ac ae-17f 192 212-213 218-21b 237 2c6-2c7 2d8-2dd 300-304 306-308 30a-30c 311-312 323 326-328 1e80-1e89 1e9e 1ef2-1ef3 2000-200b 2010-2015 2018-201a 201c-201e 2020-2022 2026 2030-2031 2039-203a 203d-203e 2044 2074 20ac 2116 2122 2202 2205 220f 2211-2212 2215 2219-221a 221e 222b 2248 2260 2264-2265 25ca 2761 fb01-fb02',
  'dm-serif-display': '20-7e a0-107 10c-113 116-11b 11e-11f 122-123 12a-12b 12e-131 136-137 139-148 14c-14d 150-15b 15e-165 16a-16b 16e-173 178-17e 218-21b 2c6-2c7 2d8-2dd 300-304 306-308 30a-30c 326-328 2013-2014 2018-201a 201c-201e 2020-2022 2026 2030 2039-203a 2044 2074 20ac 20bd 2122 212e 2212 2215 2219 2248 2260 2264-2265',
  'cinzel': '20-7e a0-107 10a-113 116-11b 11e-123 126-127 12a-12b 12e-133 136-137 139-148 14a-14d 150-15b 15e-167 16a-16b 16e-17e 192 218-21b 2c6-2c7 2d8-2dd 300-304 306-308 30a-30c 326-328 1e80-1e85 1ef2-1ef3 2013-2014 2018-201a 201c-201e 2020-2022 2026 2030 2039-203a 2044 2074 20ac 2122 2202 220f 2211-2212 2215 221a 221e 222b 2248 2260 2264-2265 25ca fb01-fb02',
  'cormorant-garamond': '20-7e a0-b4 b6-17f 18f 192 197 1a0-1a1 1af-1b0 1cd-1dc 1e2-1e3 1e6-1eb 1f8-21b 232-233 237 244 251 259 261 268 289 2bb-2bc 2be-2bf 2c6-2c7 2ca-2cb 2d8-2dd 300-304 306-30d 30f 311 31b 323-324 326-328 32d-32e 331 34f 358 1e0c-1e0f 1e20-1e21 1e24-1e25 1e2a-1e2b 1e30-1e31 1e36-1e3b 1e3e-1e4b 1e5a-1e63 1e6c-1e6f 1e80-1e85 1e8e-1e8f 1e92-1e93 1e97 1e9e 1ea0-1ef9 2000-200d 2010-2014 2018-201a 201c-201e 2020-2022 2026-2029 202f-2030 2032-2033 2039-203a 2042-2044 205f-2060 2063 2070 2074-207a 207d-2089 208d-208e 20a1 20a4 20a6-20a7 20aa-20ac 20ae 20b1-20b2 20b4-20b5 20b8-20ba 20bd 2113 2116-2117 2120 2122 212e 215b-215e 2190-2199 2202 2205 220f 2211-2212 221a 221e 222b 2248 2260 2264-2265 25a0-25a1 25b2-25b3 25b6-25b7 25bc-25bd 25c0-25c1 25c6-25c7 25ca-25cb 25cf 25e6 25fb-25fc 261c 261e 263a 2766 a729 a78b-a78c',
};
