import { route, readJson, HttpError, sessionUser } from '@/lib/http';
import { saveSettings } from '@/lib/portal';
import { SEGMENT_NAMES, DEFAULT_SETTINGS } from '@/lib/intel';
import { logInfo } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async ({ portal }) => ({ settings: portal.settings, segments: SEGMENT_NAMES, defaults: DEFAULT_SETTINGS }), { admin: true });

function intIn(v, min, max, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, 'valor_invalido', `${label}: use um número inteiro entre ${min} e ${max}.`);
  return n;
}

// Passo 3: preferências do cliente (cache, nome da empresa, critérios e pesos do score).
export const POST = route(
  async ({ request, portal, session }) => {
    const body = await readJson(request);
    const weights = {};
    for (const k of Object.keys(DEFAULT_SETTINGS.weights)) {
      weights[k] = intIn(body.weights?.[k] ?? DEFAULT_SETTINGS.weights[k], 0, 100, `Peso "${k}"`);
    }
    if (Object.values(weights).every((w) => w === 0)) throw new HttpError(400, 'valor_invalido', 'Pelo menos um peso precisa ser maior que zero.');
    const settings = saveSettings(portal.id, {
      ttlDays: intIn(body.ttlDays ?? 30, 0, 365, 'Dias de cache'),
      staleDays: intIn(body.staleDays ?? 90, 1, 730, 'Dias para considerar desatualizada'),
      titleFrom: body.titleFrom === 'razao' ? 'razao' : 'fantasia',
      timelineComment: body.timelineComment !== false,
      autoFollowUp: body.autoFollowUp !== false,
      followUpDays: intIn(body.followUpDays ?? 2, 0, 30, 'Prazo do follow-up (dias)'),
      targetSegments: (Array.isArray(body.targetSegments) ? body.targetSegments : []).filter((s) => SEGMENT_NAMES.includes(s)),
      weights,
    });
    logInfo(portal.id, 'configuracao', 'Preferências atualizadas', { ttlDays: settings.ttlDays, targetSegments: settings.targetSegments.length }, sessionUser(session));
    return { settings };
  },
  { admin: true },
);
