/**
 * Coque des éditeurs plein écran : ni en-tête, ni pied de page, ni WhatsApp, ni barre mobile du
 * site (ils vivent dans `(site)/layout.tsx`).
 */
export default function LayoutStudio({ children }: { children: React.ReactNode }) {
  return <div className="flex-1">{children}</div>;
}
