export const escapeXml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const xmlResponse = (body: string, type: string) =>
	new Response(body, { headers: { 'Content-Type': `${type}; charset=utf-8` } });
