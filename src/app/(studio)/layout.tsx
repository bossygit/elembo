/**
 * Coque des éditeurs plein écran : ni en-tête, ni pied de page, ni WhatsApp, ni barre mobile du
 * site (ils vivent dans `(site)/layout.tsx`).
 */
export default function LayoutStudio({ children }: { children: React.ReactNode }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return (
    <div className="flex-1">
      {/* Polices du Studio : mêmes glyphes que le PDF, italiques réelles (scripts/polices-banner.py). */}
      <link rel="stylesheet" href={`${basePath}/fonts/studio/polices.css`} precedence="default" />
      {children}
    </div>
  );
}
