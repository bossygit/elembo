'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RecuperationDevis() {
  const router = useRouter();
  const [reference, setReference] = useState('');
  const [code, setCode] = useState('');
  const [etape, setEtape] = useState<'reference' | 'code'>('reference');
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function demander(evenement: React.FormEvent) {
    evenement.preventDefault();
    setErreur('');
    setMessage('');
    setEnvoi(true);
    try {
      const r = await fetch('/api/devis/suivi/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: reference.trim() }),
      });
      if (!r.ok) {
        setErreur(r.status === 429 ? 'Trop de demandes. Réessayez plus tard.' : 'Service temporairement indisponible.');
        return;
      }
      setEtape('code');
      setMessage('Si un canal est associé à ce devis, un code à 6 chiffres vient d’être envoyé. Il expire dans 10 minutes.');
    } finally {
      setEnvoi(false);
    }
  }

  async function verifier(evenement: React.FormEvent) {
    evenement.preventDefault();
    setErreur('');
    setEnvoi(true);
    try {
      const r = await fetch('/api/devis/suivi/otp/verifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: reference.trim(), code: code.trim() }),
      });
      if (!r.ok) {
        setErreur('Référence ou code invalide.');
        return;
      }
      router.push(`/devis/${encodeURIComponent(reference.trim().toUpperCase())}`);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-filet bg-white p-6">
      {etape === 'reference' ? (
        <form onSubmit={demander} className="space-y-4">
          <label className="block text-sm font-medium">
            Référence du devis
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
              placeholder="DEV-20261109-ABCD1234"
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 font-mono"
            />
          </label>
          <button
            type="submit"
            disabled={envoi}
            className="rounded-full bg-encre px-5 py-2.5 text-sm font-semibold text-creme disabled:opacity-60"
          >
            Recevoir un code
          </button>
        </form>
      ) : (
        <form onSubmit={verifier} className="space-y-4">
          <p className="text-sm text-attenue">{message}</p>
          <label className="block text-sm font-medium">
            Code à 6 chiffres
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-center font-mono text-2xl tracking-[0.4em]"
            />
          </label>
          <button
            type="submit"
            disabled={envoi || code.length !== 6}
            className="rounded-full bg-encre px-5 py-2.5 text-sm font-semibold text-creme disabled:opacity-60"
          >
            Ouvrir mon devis
          </button>
          <button
            type="button"
            onClick={() => {
              setEtape('reference');
              setCode('');
              setErreur('');
            }}
            className="block text-xs text-attenue underline"
          >
            Utiliser une autre référence
          </button>
        </form>
      )}
      {erreur ? <p className="mt-4 text-sm text-red-700">{erreur}</p> : null}
    </div>
  );
}
