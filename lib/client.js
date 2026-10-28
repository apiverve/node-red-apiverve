'use strict';
// Fixed-host transport for api.apiverve.com and the public API catalog.

const API_BASE = 'https://api.apiverve.com';
const CATALOG_URL = 'https://assets.apiverve.com/cli-manifest.json';
const VERSION = require('../package.json').version;
const USER_AGENT = `node-red-apiverve/${VERSION}`;
const TIMEOUT_MS = 60000;
const CATALOG_TTL_MS = 3600000;

class ApiverveError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = 'ApiverveError';
        this.statusCode = statusCode;
    }

    // Node-RED puts err.toString() in msg.error.message; keep it to the readable text.
    toString() {
        return this.message;
    }
}

let catalog = null;
let catalogAt = 0;

/** The API catalog keyed by id, cached for an hour; a stale copy beats none. */
async function getCatalog() {
    if (catalog && Date.now() - catalogAt < CATALOG_TTL_MS) return catalog;
    try {
        const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        catalog = (await res.json()).apis;
        catalogAt = Date.now();
    } catch (err) {
        if (!catalog) throw new ApiverveError(`Could not load the APIVerve catalog: ${err.message}`);
    }
    return catalog;
}

function clean(params) {
    return Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

function toQueryValue(value) {
    if (Array.isArray(value)) return value.map(toQueryValue).join(',');
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function errorMessage(status, payload) {
    const detail = payload && typeof payload === 'object' ? payload.error || payload.message : undefined;
    if (status === 401) return 'APIVerve rejected the API key.';
    if (status === 403) return `This API key is not allowed to make this call${detail ? `: ${detail}` : '.'}`;
    if (status === 429) return 'Rate limit reached or monthly credits used up. Retry shortly, or upgrade at https://dashboard.apiverve.com.';
    return detail ? `APIVerve returned ${status}: ${detail}` : `APIVerve returned HTTP ${status}.`;
}

/**
 * Call one API by catalog id. GET params go in the query string; POST params go in a
 * JSON body except those the catalog marks as query. Resolves with the response
 * envelope, the HTTP status and the remaining-credits header.
 */
async function callApi(apiKey, id, params) {
    if (!apiKey) throw new ApiverveError('No API key. Add one in the APIVerve config node, or set APIVERVE_API_KEY. Get a key at https://dashboard.apiverve.com.');
    const api = (await getCatalog())[id];
    if (!api) throw new ApiverveError(`Unknown API "${id}". Pick one from the list, or see https://apiverve.com/marketplace.`);

    const method = api.method === 'POST' ? 'POST' : 'GET';
    const inQuery = new Set((api.params || []).filter((p) => p.in === 'query').map((p) => p.name));
    const url = new URL(API_BASE + api.path);
    const body = {};
    for (const [k, v] of Object.entries(clean(params))) {
        if (method === 'GET' || inQuery.has(k)) url.searchParams.set(k, toQueryValue(v));
        else body[k] = v;
    }

    let res;
    try {
        res = await fetch(url, {
            method,
            headers: {
                'x-api-key': apiKey,
                'User-Agent': USER_AGENT,
                Accept: 'application/json',
                ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
            },
            body: method === 'POST' ? JSON.stringify(body) : undefined,
            // The key is only ever sent to API_BASE; never follow a redirect elsewhere.
            redirect: 'error',
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (err) {
        throw new ApiverveError('APIVerve could not be reached. Retry in a moment.');
    }

    let payload;
    try { payload = await res.json(); } catch { payload = undefined; }
    if (!res.ok || (payload && payload.status === 'error')) {
        throw new ApiverveError(errorMessage(res.status, payload), res.status);
    }
    const credits = res.headers.get('x-api-remaining-credits');
    return { envelope: payload, statusCode: res.status, remainingCredits: credits == null ? null : Number(credits) };
}

/** Params from an incoming payload: an object is used as-is; a plain value fills the
    API's only required parameter, so an inject node can send just an email address. */
async function paramsFromPayload(id, payload) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && !Buffer.isBuffer(payload)) return payload;
    if (payload === undefined || payload === null || payload === '' || typeof payload === 'object') return {};
    const api = (await getCatalog())[id];
    const required = ((api && api.params) || []).filter((p) => p.required);
    return required.length === 1 ? { [required[0].name]: payload } : {};
}

function resetCatalog() {
    catalog = null;
    catalogAt = 0;
}

module.exports = { API_BASE, CATALOG_URL, ApiverveError, getCatalog, callApi, paramsFromPayload, resetCatalog };
