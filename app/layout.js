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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
