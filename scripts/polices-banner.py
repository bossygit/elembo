#!/usr/bin/env python3
"""Prépare les polices du Banner Studio à partir des fichiers officiels du dépôt google/fonts.

Usage (une seule fois, les fichiers produits sont versionnés) :

    python3 -m venv /tmp/vf && /tmp/vf/bin/pip install fonttools==4.69.0 brotli==1.2.1
    /tmp/vf/bin/python scripts/polices-banner.py /tmp/cache-polices

Pour chaque variante, **un seul** jeu de glyphes sert aux deux rendus :
  - public/fonts/studio/<id>-<graisse>[i].woff2   affichage dans l'éditeur ;
  - assets/banner/polices/<id>-<graisse>[i].ttf   PDF de production (lot 5).
Mêmes glyphes, mêmes avances, même crénage : l'écart éditeur/PDF du lot 0 ne peut pas revenir par
les fichiers. Aucune graisse ni italique n'est simulée : seules les variantes réelles sont produites.

Licence : une police dont le nom est réservé (« Reserved Font Name ») n'est ni réduite ni instanciée ;
son fichier d'origine est gardé tel quel. Les autres sont réduites au latin (accents, API, ponctuation).
"""

import re
import subprocess
import sys
import urllib.parse
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

RACINE = Path(__file__).resolve().parent.parent
CACHE = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/cache-polices')
COMMIT = '6ebe737e44fd64ee736bbc6feed6136a6dbfd222'

# Nom réservé et dépôt en police variable : on prend les fichiers statiques que Google distribue.
_PF = 'https://fonts.gstatic.com/s/playfairdisplay/v40/'
PLAYFAIR = {400: _PF + 'nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQ.ttf', 700: _PF + 'nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKeiukDQ.ttf'}
PLAYFAIR_ITALIQUE = {400: _PF + 'nuFRD-vYSZviVYUb_rj3ij__anPXDTnCjmHKM4nYO7KN_qiTbtY.ttf', 700: _PF + 'nuFRD-vYSZviVYUb_rj3ij__anPXDTnCjmHKM4nYO7KN_k-UbtY.ttf'}

# (id, nom, catégorie, dossier google/fonts, droite, italique, graisses)
CATALOGUE = [
    ('montserrat', 'Montserrat', 'sans', 'ofl/montserrat', 'Montserrat[wght]', 'Montserrat-Italic[wght]', (400, 700)),
    ('poppins', 'Poppins', 'sans', 'ofl/poppins', {400: 'Poppins-Regular', 700: 'Poppins-Bold'}, {400: 'Poppins-Italic', 700: 'Poppins-BoldItalic'}, (400, 700)),
    ('bebas-neue', 'Bebas Neue', 'sans', 'ofl/bebasneue', 'BebasNeue-Regular', None, (400,)),
    ('oswald', 'Oswald', 'sans', 'ofl/oswald', 'Oswald[wght]', None, (400, 700)),
    ('anton', 'Anton', 'sans', 'ofl/anton', 'Anton-Regular', None, (400,)),
    ('archivo-black', 'Archivo Black', 'sans', 'ofl/archivoblack', 'ArchivoBlack-Regular', None, (400,)),
    ('bangers', 'Bangers', 'display', 'ofl/bangers', 'Bangers-Regular', None, (400,)),
    ('righteous', 'Righteous', 'display', 'ofl/righteous', 'Righteous-Regular', None, (400,)),
    ('russo-one', 'Russo One', 'display', 'ofl/russoone', 'RussoOne-Regular', None, (400,)),
    ('alfa-slab-one', 'Alfa Slab One', 'display', 'ofl/alfaslabone', 'AlfaSlabOne-Regular', None, (400,)),
    ('pacifico', 'Pacifico', 'script', 'ofl/pacifico', 'Pacifico-Regular', None, (400,)),
    ('lobster', 'Lobster', 'script', 'ofl/lobster', 'Lobster-Regular', None, (400,)),
    ('caveat', 'Caveat', 'script', 'ofl/caveat', 'Caveat[wght]', None, (400, 700)),
    ('permanent-marker', 'Permanent Marker', 'script', 'apache/permanentmarker', 'PermanentMarker-Regular', None, (400,)),
    ('great-vibes', 'Great Vibes', 'script', 'ofl/greatvibes', 'GreatVibes-Regular', None, (400,)),
    ('playfair-display', 'Playfair Display', 'serif', 'ofl/playfairdisplay', PLAYFAIR, PLAYFAIR_ITALIQUE, (400, 700)),
    ('bodoni-moda', 'Bodoni Moda', 'serif', 'ofl/bodonimoda', 'BodoniModa[opsz,wght]', 'BodoniModa-Italic[opsz,wght]', (400, 700)),
    ('dm-serif-display', 'DM Serif Display', 'serif', 'ofl/dmserifdisplay', 'DMSerifDisplay-Regular', 'DMSerifDisplay-Italic', (400,)),
    ('cinzel', 'Cinzel', 'serif', 'ofl/cinzel', 'Cinzel[wght]', None, (400, 700)),
    ('cormorant-garamond', 'Cormorant Garamond', 'serif', 'ofl/cormorantgaramond', 'CormorantGaramond[wght]', 'CormorantGaramond-Italic[wght]', (400, 700)),
]

PLAGES = [(0x20, 0x7E), (0xA0, 0x24F), (0x250, 0x2FF), (0x300, 0x36F), (0x1E00, 0x1EFF), (0x2000, 0x206F), (0x2070, 0x209F),
          (0x20A0, 0x20CF), (0x2100, 0x218F), (0x2190, 0x22FF), (0x25A0, 0x27BF), (0xA720, 0xA7FF), (0xFB00, 0xFB06)]


def fichier(chemin):
    distant = chemin.startswith('https://')
    local = CACHE / (chemin.split('//')[1] if distant else chemin)
    if not local.exists():
        local.parent.mkdir(parents=True, exist_ok=True)
        url = chemin if distant else f'https://raw.githubusercontent.com/google/fonts/{COMMIT}/{urllib.parse.quote(chemin)}'
        # curl plutôt qu'urllib : il utilise les certificats du système.
        subprocess.run(['curl', '-fsSL', '--retry', '3', '-o', str(local), url], check=True)
    return local


def reduire(police):
    o = Options()
    o.hinting = False
    o.notdef_outline = True
    o.name_IDs = ['*']
    # Sans `calt` : fontkit et le navigateur ne composent pas les variantes contextuelles de la même
    # façon (Caveat, Pacifico : jusqu'à 2,2 % d'écart de largeur, mesuré le 25/11/2026).
    o.layout_features = ['kern', 'mark', 'mkmk', 'ccmp', 'locl', 'rlig', 'liga', 'clig']
    s = Subsetter(o)
    s.populate(unicodes=[u for a, b in PLAGES for u in range(a, b + 1)])
    s.subset(police)


def plages(codes):
    sortie, codes = [], sorted(codes)
    for c in codes:
        if sortie and c == sortie[-1][1] + 1:
            sortie[-1][1] = c
        else:
            sortie.append([c, c])
    return ' '.join(f'{a:x}' if a == b else f'{a:x}-{b:x}' for a, b in sortie)


ttf_dir = RACINE / 'assets/banner/polices'
web_dir = RACINE / 'public/fonts/studio'
for d in (ttf_dir, web_dir):
    d.mkdir(parents=True, exist_ok=True)
    for f in d.glob('*'):
        if f.is_file():
            f.unlink()

css = ['/* GÉNÉRÉ par scripts/polices-banner.py : polices du Banner Studio, distinctes de celles du textile. */']
ts_polices, ts_metriques, ts_couverture = [], [], []
total_ttf = total_web = 0

for pid, nom, categorie, dossier, droite, italique, graisses in CATALOGUE:
    licence = fichier(f"{dossier}/{'LICENSE.txt' if dossier.startswith('apache') else 'OFL.txt'}").read_text(encoding='utf-8', errors='replace')
    entete = licence.split('-----')[0] if dossier.startswith('ofl') else ''
    reserve = bool(re.search(r'reserved font name', entete, re.I))
    (ttf_dir / f"LICENCE-{pid}.txt").write_text(licence, encoding='utf-8')
    variantes, metriques, commune = [], [], None
    for source, est_italique in ((droite, False), (italique, True)):
        if source is None:
            continue
        for g in graisses:
            base = source[g] if isinstance(source, dict) else source
            chemin = fichier(base if base.startswith('https://') else f'{dossier}/{base}.ttf')
            police = TTFont(chemin, recalcTimestamp=False)
            variable = 'fvar' in police
            if reserve and variable:
                sys.exit(f'{nom} : nom réservé et police variable, à traiter à la main')
            cle = f"{g}{'i' if est_italique else ''}"
            if variable:
                axes = {a.axisTag: a.defaultValue for a in police['fvar'].axes}
                axes['wght'] = g
                police = instantiateVariableFont(police, axes, inplace=False, updateFontNames=False)
            if reserve:
                (ttf_dir / f'{pid}-{cle}.ttf').write_bytes(chemin.read_bytes())
            else:
                reduire(police)
                # Le sous-ensemble de @pdf-lib/fontkit suppose des glyphes alignés : sans cela, des lettres
                # disparaissent du PDF (Cormorant Garamond, constaté le 25/11/2026).
                police['glyf'].padding = 4
                police.save(ttf_dir / f'{pid}-{cle}.ttf')
            police = TTFont(ttf_dir / f'{pid}-{cle}.ttf', recalcTimestamp=False)
            em, hhea = police['head'].unitsPerEm, police['hhea']
            metriques.append(f"'{cle}': {{ ascendante: {round(hhea.ascent / em, 6)}, descendante: {round(hhea.descent / em, 6)} }}")
            codes = set(police.getBestCmap())
            commune = codes if commune is None else commune & codes
            police.flavor = 'woff2'
            police.save(web_dir / f'{pid}-{cle}.woff2')
            total_ttf += (ttf_dir / f'{pid}-{cle}.ttf').stat().st_size
            total_web += (web_dir / f'{pid}-{cle}.woff2').stat().st_size
            variantes.append(f"'{cle}'")
            css.append(f"@font-face{{font-family:'Studio {nom}';font-style:{'italic' if est_italique else 'normal'};font-weight:{g};font-display:block;src:url('./{pid}-{cle}.woff2') format('woff2')}}")
    commune &= {u for a, b in PLAGES for u in range(a, b + 1)}
    spdx = 'Apache-2.0' if dossier.startswith('apache') else 'OFL-1.1'
    ts_polices.append(f"  {{ id: '{pid}', nom: '{nom}', categorie: '{categorie}', licence: '{spdx}', variantes: [{', '.join(variantes)}] }},")
    ts_metriques.append(f"  '{pid}': {{ {', '.join(metriques)} }},")
    ts_couverture.append(f"  '{pid}': '{plages(commune)}',")
    print(f"{nom:20} {len(variantes)} variante(s) {'nom réservé, fichier intact' if reserve else ''} {len(commune)} caractères")

(web_dir / 'polices.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
(RACINE / 'src/lib/banner/polices.generated.ts').write_text(
    """// GÉNÉRÉ par scripts/polices-banner.py — ne pas modifier à la main.
// Source : google/fonts@""" + COMMIT + """

import type { MetriquesPolice } from './layout';

/** Variante réelle d'une police : graisse, suivie de `i` pour l'italique. */
export type Variante = '400' | '700' | '400i' | '700i';
export type PoliceBanner = { id: string; nom: string; categorie: 'sans' | 'display' | 'script' | 'serif'; licence: string; variantes: Variante[] };

export const POLICES_BANNER: PoliceBanner[] = [
""" + '\n'.join(ts_polices) + """
];

/** Métriques verticales (table hhea), en em. */
export const METRIQUES: Record<string, Partial<Record<Variante, MetriquesPolice>>> = {
""" + '\n'.join(ts_metriques) + """
};

/** Caractères présents dans **toutes** les variantes, en plages hexadécimales. */
export const COUVERTURE: Record<string, string> = {
""" + '\n'.join(ts_couverture) + """
};
""", encoding='utf-8')
print(f'TTF {total_ttf // 1024} Ko, WOFF2 {total_web // 1024} Ko')
