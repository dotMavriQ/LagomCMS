// The service behind a LagomCMS site's "ask" button.
//
// The page sends    POST {"message": "...", "previous": {"question": "...", "answer": "..."}}
// and gets back     {"reply": "..."}            on success
//                   {"error": "...", "detail": "..."}   with a 4xx or 5xx status otherwise
//
// "previous" is optional: the last question and its answer, so a follow-up makes sense.
// Nothing is stored here between requests.
//
// Deploy:  npx wrangler deploy     (after editing about.js and ALLOWED_ORIGIN in wrangler.toml)
// Then paste the address wrangler prints into the CMS, under AI Chat > Endpoint.

import { ABOUT } from './about.js';

// The page caps a question at 500 characters. A request that ignores the cap did not
// come from the page, and long prompts are what cost money.
const MAX_QUESTION = 500;
const MAX_REMEMBERED = 2000;

export default {
    async fetch(request, env) {
        // Browsers only let the site read the answer if these headers name it. This keeps
        // other websites from putting your assistant on their pages; it does not stop
        // somebody with curl. For that, add a rate limiting rule in the Cloudflare dashboard.
        const cors = {
            'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Vary': 'Origin',
        };
        const json = (status, body) => Response.json(body, { status, headers: cors });

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors });
        }
        if (request.method !== 'POST') {
            return json(405, { error: 'Only POST is answered here.' });
        }
        if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN) {
            return json(403, { error: 'This assistant belongs to another site.' });
        }

        const body = await request.json().catch(() => null);
        const message = typeof body?.message === 'string' ? body.message.trim() : '';
        if (message === '' || message.length > MAX_QUESTION) {
            return json(400, { error: 'Send a question of at most ' + MAX_QUESTION + ' characters.' });
        }

        const messages = [{ role: 'system', content: ABOUT.trim() }];
        const { question, answer } = body.previous ?? {};
        if (typeof question === 'string' && typeof answer === 'string') {
            messages.push({ role: 'user', content: question.slice(0, MAX_QUESTION) });
            messages.push({ role: 'assistant', content: answer.slice(0, MAX_REMEMBERED) });
        }
        messages.push({ role: 'user', content: message });

        try {
            const result = await env.AI.run(env.MODEL, { messages, max_tokens: 400 });
            return json(200, { reply: String(result.response ?? '').trim() });
        } catch (error) {
            // Out of the day's free allowance is the one failure visitors will actually meet.
            // The page recognises it from the wording and shows the "run out" message.
            const detail = String(error?.message ?? error);
            const spent = detail.includes('4006') || /daily free allocation/i.test(detail);
            return json(spent ? 429 : 502, { error: 'The model did not answer.', detail });
        }
    },
};
