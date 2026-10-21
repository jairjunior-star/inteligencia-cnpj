// O app pode ser aberto dentro do Bitrix24 (iframe). FRAME_ANCESTORS permite incluir domínios de portais próprios.
const defaultAncestors = [
  "'self'",
  'https://*.bitrix24.com.br',
  'https://*.bitrix24.com',
  'https://*.bitrix24.eu',
  'https://*.bitrix24.es',
  'https://*.bitrix24.de',
  'https://*.bitrix24.ru',
  'https://*.bitrix24.in',
  'https://*.bitrix24.fr',
  'https://*.bitrix24.it',
  'https://*.bitrix24.pl',
  'https://*.bitrix24.uk',
  'https://onnira.com',
  'https://*.onnira.com',
];

const frameAncestors = [...defaultAncestors, ...String(process.env.FRAME_ANCESTORS || '').split(/[\s,]+/).filter(Boolean)].join(' ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: `frame-ancestors ${frameAncestors}` },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
