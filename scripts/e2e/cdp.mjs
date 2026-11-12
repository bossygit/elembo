// Client Chrome DevTools Protocol minimal pour les essais de bout en bout du studio.
//
// Aucune dépendance : Node 26 fournit `fetch` et `WebSocket`. Le navigateur est lancé en
// mode headless avec un profil temporaire ; on pilote un onglet par session aplatie.
//
// Usage (bibliothèque) :
//   import { lancerChrome, ouvrirPage } from './cdp.mjs';
//   const chrome = await lancerChrome();
//   const page = await ouvrirPage(chrome, { width: 1440, height: 1000 });
//   await page.goto('http://localhost:3000/personnalisation');
//   await page.screenshot('/tmp/studio.png');

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function attendrePort(url, essais = 100) {
  for (let i = 0; i < essais; i++) {
    try {
      const reponse = await fetch(url);
      if (reponse.ok) return await reponse.json();
    } catch {
      // le navigateur démarre encore
    }
    await attendre(100);
  }
  throw new Error(`Chrome n'a pas ouvert son port de débogage (${url})`);
}

/** Lance Chrome headless et renvoie le point d'entrée WebSocket du navigateur. */
export async function lancerChrome({ port = 9333, headless = true } = {}) {
  if (!existsSync(CHROME)) throw new Error(`Chrome introuvable : ${CHROME}`);
  const profil = mkdtempSync(join(tmpdir(), 'elembo-chrome-'));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profil}`,
    '--no-first-run',
    '--no-default-browser-check',
    // Le bac à sable macOS de Chrome ne peut pas s'initialiser dans l'environnement de
    // test (dossiers système non inscriptibles) : sans ces options, le service réseau
    // plante et les pages ne se chargent jamais.
    '--no-sandbox',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--hide-scrollbars',
    '--window-size=1440,1000',
    ...(headless ? ['--headless=new'] : []),
  ];
  const processus = spawn(CHROME, args, { stdio: 'ignore' });
  const version = await attendrePort(`http://127.0.0.1:${port}/json/version`);
  return {
    port,
    processus,
    profil,
    wsBrowser: version.webSocketDebuggerUrl,
    async fermer() {
      try {
        processus.kill('SIGTERM');
      } catch {
        // déjà arrêté
      }
      await attendre(300);
      try {
        rmSync(profil, { recursive: true, force: true });
      } catch {
        // profil temporaire déjà supprimé
      }
    },
  };
}

class Session {
  #ws;
  #id = 0;
  #enAttente = new Map();
  #ecouteurs = new Map();

  constructor(ws, sessionId) {
    this.#ws = ws;
    this.sessionId = sessionId;
    ws.addEventListener('message', (evenement) => {
      const message = JSON.parse(evenement.data);
      if (message.id && this.#enAttente.has(message.id)) {
        const { resolve, reject } = this.#enAttente.get(message.id);
        this.#enAttente.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else resolve(message.result);
        return;
      }
      if (message.method) {
        for (const ecouteur of this.#ecouteurs.get(message.method) ?? []) ecouteur(message.params);
      }
    });
  }

  envoyer(method, params = {}, timeoutMs = 20000) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const minuteur = setTimeout(() => {
        this.#enAttente.delete(id);
        reject(new Error(`CDP ${method} : délai dépassé (${timeoutMs} ms)`));
      }, timeoutMs);
      this.#enAttente.set(id, {
        resolve: (valeur) => {
          clearTimeout(minuteur);
          resolve(valeur);
        },
        reject: (erreur) => {
          clearTimeout(minuteur);
          reject(erreur);
        },
      });
      this.#ws.send(JSON.stringify({ id, method, params, sessionId: this.sessionId }));
    });
  }

  sur(method, ecouteur) {
    const liste = this.#ecouteurs.get(method) ?? [];
    liste.push(ecouteur);
    this.#ecouteurs.set(method, liste);
    return () => {
      this.#ecouteurs.set(
        method,
        (this.#ecouteurs.get(method) ?? []).filter((e) => e !== ecouteur),
      );
    };
  }

  async attendreEvenement(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        desinscrire();
        reject(new Error(`Délai dépassé en attendant ${method}`));
      }, timeoutMs);
      const desinscrire = this.sur(method, (params) => {
        clearTimeout(timer);
        desinscrire();
        resolve(params);
      });
    });
  }

  async eval(expression, { awaitPromise = true } = {}) {
    const resultat = await this.envoyer('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (resultat.exceptionDetails) {
      const texte =
        resultat.exceptionDetails.exception?.description ?? resultat.exceptionDetails.text ?? 'erreur JS';
      throw new Error(`Évaluation échouée : ${texte}\n---\n${expression.slice(0, 400)}`);
    }
    return resultat.result?.value;
  }

  async goto(url) {
    const chargement = this.attendreEvenement('Page.loadEventFired');
    await this.envoyer('Page.navigate', { url });
    await chargement;
  }

  /** Attend qu'une expression renvoie une valeur « vraie ». */
  async attendre(expression, { timeoutMs = 30000, intervalle = 150, message } = {}) {
    const debut = Date.now();
    let derniere;
    while (Date.now() - debut < timeoutMs) {
      derniere = await this.eval(`(async () => { try { return (${expression}); } catch (e) { return null; } })()`);
      if (derniere) return derniere;
      await attendre(intervalle);
    }
    throw new Error(`Condition non remplie en ${timeoutMs} ms : ${message ?? expression}`);
  }

  async screenshot(chemin, { fullPage = false } = {}) {
    const parametres = { format: 'png', captureBeyondViewport: fullPage };
    if (fullPage) {
      const metriques = await this.envoyer('Page.getLayoutMetrics');
      const contenu = metriques.cssContentSize ?? metriques.contentSize;
      parametres.clip = { x: 0, y: 0, width: Math.ceil(contenu.width), height: Math.ceil(contenu.height), scale: 1 };
    }
    const { data } = await this.envoyer('Page.captureScreenshot', parametres);
    await writeFile(chemin, Buffer.from(data, 'base64'));
    return chemin;
  }

  async viewport(width, height, { mobile = false, dpr = mobile ? 3 : 1 } = {}) {
    await this.envoyer('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dpr,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
    if (mobile) await this.envoyer('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }

  async souris(type, x, y, { bouton = 'left', clics = 1 } = {}) {
    await this.envoyer('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: type === 'mouseReleased' ? bouton : bouton,
      buttons: type === 'mousePressed' ? 1 : type === 'mouseMoved' ? (bouton === 'left' ? 1 : 0) : 0,
      clickCount: clics,
      pointerType: 'mouse',
    });
  }

  async cliquer(x, y) {
    await this.souris('mouseMoved', x, y);
    await this.souris('mousePressed', x, y);
    await this.souris('mouseReleased', x, y);
  }

  async toucher(x, y) {
    await this.envoyer('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, id: 1 }],
    });
    await this.envoyer('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  async envoyerFichiers(selecteur, chemins) {
    const { root } = await this.envoyer('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await this.envoyer('DOM.querySelector', { nodeId: root.nodeId, selector: selecteur });
    if (!nodeId) throw new Error(`Sélecteur introuvable : ${selecteur}`);
    await this.envoyer('DOM.setFileInputFiles', { nodeId, files: chemins });
    // L'événement change n'est pas toujours synthétisé par CDP : on le déclenche.
    await this.eval(
      `(() => { const el = document.querySelector(${JSON.stringify(selecteur)}); el?.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
    );
  }
}

/** Crée un onglet et renvoie une session prête (Page + Runtime activés). */
export async function ouvrirPage(chrome, { width = 1440, height = 1000, mobile = false } = {}) {
  const ws = new WebSocket(chrome.wsBrowser);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const envoyer = (method, params = {}, sessionId, timeoutMs = 20000) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      const minuteur = setTimeout(() => {
        ws.removeEventListener('message', ecouteur);
        reject(new Error(`CDP ${method} : délai dépassé (${timeoutMs} ms)`));
      }, timeoutMs);
      const ecouteur = (evenement) => {
        const message = JSON.parse(evenement.data);
        if (message.id !== messageId) return;
        clearTimeout(minuteur);
        ws.removeEventListener('message', ecouteur);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      };
      ws.addEventListener('message', ecouteur);
      ws.send(JSON.stringify({ id: messageId, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const { targetId } = await envoyer('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await envoyer('Target.attachToTarget', { targetId, flatten: true });
  const page = new Session(ws, sessionId);
  page.close = () => {
    ws.close();
    return envoyer('Target.closeTarget', { targetId }).catch(() => undefined);
  };
  await page.envoyer('Page.enable');
  await page.envoyer('Runtime.enable');
  await page.envoyer('DOM.enable');
  await page.envoyer('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: mobile ? 3 : 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
  if (mobile) await page.envoyer('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  return page;
}

/** Formate une durée lisible pour les comptes rendus. */
export function duree(ms) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
