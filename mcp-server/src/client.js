// ============================================================
// wacrm public API client.
//
// A thin wrapper over the `/api/v1` REST surface. It attaches the
// bearer key, unwraps the `{ data }` / `{ error }` envelope, and
// turns API failures into a typed WacrmApiError the tools can render
// cleanly. Nothing here knows about MCP — it's just the CRM API.
// ============================================================
/** A structured error from the wacrm API envelope (`{ error: { code, message } }`). */
export class WacrmApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'WacrmApiError';
        this.status = status;
        this.code = code;
    }
}
export class WacrmClient {
    constructor(config) {
        this.baseUrl = config.baseUrl;
        this.apiKey = config.apiKey;
    }
    async request(method, path, options = {}) {
        var _a, _b, _c, _d;
        const url = new URL(`${this.baseUrl}/api/v1${path}`);
        if (options.query) {
            for (const [key, value] of Object.entries(options.query)) {
                if (value !== undefined && value !== null && value !== '') {
                    url.searchParams.set(key, String(value));
                }
            }
        }
        const headers = {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
        };
        if (options.body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }
        let res;
        try {
            res = await fetch(url, {
                method,
                headers,
                body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
            });
        }
        catch (err) {
            throw new WacrmApiError(0, 'network_error', `Could not reach wacrm at ${this.baseUrl}: ${err.message}`);
        }
        // 429s carry a Retry-After we surface to the model.
        let payload = undefined;
        const text = await res.text();
        if (text) {
            try {
                payload = JSON.parse(text);
            }
            catch (_e) {
                // Non-JSON body (e.g. an upstream proxy error page).
                if (!res.ok) {
                    throw new WacrmApiError(res.status, 'internal', text.slice(0, 500));
                }
            }
        }
        if (!res.ok) {
            const envelope = payload;
            const code = (_b = (_a = envelope === null || envelope === void 0 ? void 0 : envelope.error) === null || _a === void 0 ? void 0 : _a.code) !== null && _b !== void 0 ? _b : 'internal';
            let message = (_d = (_c = envelope === null || envelope === void 0 ? void 0 : envelope.error) === null || _c === void 0 ? void 0 : _c.message) !== null && _d !== void 0 ? _d : `Request failed with status ${res.status}`;
            if (res.status === 429) {
                const retryAfter = res.headers.get('Retry-After');
                if (retryAfter)
                    message += ` (retry after ${retryAfter}s)`;
            }
            throw new WacrmApiError(res.status, code, message);
        }
        const envelope = payload;
        return { data: envelope.data, meta: envelope.meta };
    }
    async list(path, query) {
        var _a, _b;
        const res = await this.request('GET', path, { query });
        return { data: res.data, next_cursor: (_b = (_a = res.meta) === null || _a === void 0 ? void 0 : _a.next_cursor) !== null && _b !== void 0 ? _b : null };
    }
    // --- Identity -----------------------------------------------------
    me() {
        return this.request('GET', '/me');
    }
    // --- Messages -----------------------------------------------------
    sendMessage(body) {
        return this.request('POST', '/messages', { body });
    }
    // --- Contacts -----------------------------------------------------
    listContacts(query) {
        return this.list('/contacts', query);
    }
    getContact(id) {
        return this.request('GET', `/contacts/${encodeURIComponent(id)}`);
    }
    createContact(body) {
        return this.request('POST', '/contacts', { body });
    }
    updateContact(id, body) {
        return this.request('PATCH', `/contacts/${encodeURIComponent(id)}`, { body });
    }
    // --- Conversations ------------------------------------------------
    listConversations(query) {
        return this.list('/conversations', query);
    }
    getConversation(id) {
        return this.request('GET', `/conversations/${encodeURIComponent(id)}`);
    }
    listConversationMessages(id, query) {
        return this.list(`/conversations/${encodeURIComponent(id)}/messages`, query);
    }
    // --- Broadcasts ---------------------------------------------------
    sendBroadcast(body) {
        return this.request('POST', '/broadcasts', { body });
    }
    getBroadcast(id) {
        return this.request('GET', `/broadcasts/${encodeURIComponent(id)}`);
    }
}
