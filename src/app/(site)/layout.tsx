import Footer from '../../components/site/Footer';
import BarreMobile from '../../components/site/BarreMobile';
import Header from '../../components/site/Header';
import Mouvement from '../../components/motion/Mouvement';
import WhatsAppFlottant from '../../components/site/WhatsAppFlottant';

/** Habillage du site public. Le back-office (/admin) n'en hérite pas. */
export default function LayoutSite({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#contenu" className="lien-evitement">
        Aller au contenu
      </a>
      <Header />
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <Footer />
      <WhatsAppFlottant />
      <BarreMobile />
      <Mouvement />
    </>
  );
}
