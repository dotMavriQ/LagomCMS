/**
 * Talking to the CMS's JSON API.
 *
 * Every request that changes something carries the session's CSRF token in a
 * header. The server refuses writes without it; see App::api() in src/App.php.
 */

let csrfToken = '';

export function setCsrfToken(token) {
    csrfToken = token;
}

/** An API call that failed. `status` is the HTTP status, `data` the decoded error body. */
export class ApiError extends Error {
    constructor(status, data) {
        super(data?.message ?? `The server answered ${status}.`);
        this.status = status;
        this.data = data ?? {};
    }
}

async function send(method, url, options) {
    let response;
    try {
        response = await fetch(url, { method, credentials: 'same-origin', ...options });
    } catch {
        throw new ApiError(0, { message: 'Could not reach the server. Is it still running?' });
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new ApiError(response.status, data);
    }
    return data?.data;
}

export function sendJson(method, url, body) {
    return send(method, url, {
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(body),
    });
}

export function getJson(url) {
    return send('GET', url, {});
}

/** Upload one file to a document. Resolves to {name, url, width, height}. */
export function upload(mediaUrl, file) {
    const form = new FormData();
    form.append('file', file);
    return send('POST', mediaUrl, { headers: { 'X-CSRF-Token': csrfToken }, body: form });
}
