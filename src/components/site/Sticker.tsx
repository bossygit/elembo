import { useId } from 'react';

/**
 * Pastille ronde au texte circulaire, qui tourne lentement — le « tampon » de la marque.
 * Décorative : le texte utile est déjà présent ailleurs dans la page.
 */
export default function Sticker({
  texte = 'Fabriqué à Brazzaville · Créé au Congo · ',
  className = '',
  children,
}: {
  texte?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div aria-hidden className={`relative grid aspect-square place-items-center rounded-full ${className}`}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full animate-tourne">
        <defs>
          <path id={id} d="M60 60 m-46 0 a46 46 0 1 1 92 0 a46 46 0 1 1 -92 0" />
        </defs>
        <text fill="currentColor" fontSize="10.4" fontWeight="600" letterSpacing="2.1" style={{ textTransform: 'uppercase' }}>
          <textPath href={`#${id}`}>{texte}</textPath>
        </text>
      </svg>
      <span className="relative">{children}</span>
    </div>
  );
}
