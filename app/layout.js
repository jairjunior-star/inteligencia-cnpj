import './globals.css';
import Nav from './components/Nav';

export const metadata = {
  title: 'Inteligência de CNPJ',
  description: 'Consulte, valide e enriqueça empresas do Bitrix24 a partir do CNPJ.',
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
