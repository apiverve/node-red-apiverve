'use strict';

const { callApi, getCatalog, paramsFromPayload } = require('../lib/client');

module.exports = function (RED) {
    function ApiverveConfigNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
    }
    RED.nodes.registerType('apiverve-config', ApiverveConfigNode, {
        credentials: { apiKey: { type: 'password' } },
    });

    function ApiverveNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const account = RED.nodes.getNode(config.account);
        let fixedParams = {};
        try {
            fixedParams = config.params ? JSON.parse(config.params) : {};
        } catch {
            node.warn('The parameters field is not valid JSON; ignoring it.');
        }

        node.on('input', async (msg, send, done) => {
            const id = msg.api || config.api;
            const apiKey = (account && account.credentials && account.credentials.apiKey) || process.env.APIVERVE_API_KEY;
            node.status({ fill: 'blue', shape: 'dot', text: id || 'no API' });
            try {
                if (!id) throw new Error('Pick an API in the node, or set msg.api.');
                // Node fields first, then the message, so a flow can override any value.
                const params = { ...fixedParams, ...(await paramsFromPayload(id, msg.payload)), ...(msg.params || {}) };
                const result = await callApi(apiKey, id, params);
                msg.payload = config.output === 'full' ? result.envelope : result.envelope && result.envelope.data;
                msg.statusCode = result.statusCode;
                msg.apiverve = { api: id, remainingCredits: result.remainingCredits };
                node.status({ fill: 'green', shape: 'dot', text: result.remainingCredits == null ? id : `${id} · ${result.remainingCredits} credits left` });
                send(msg);
                done();
            } catch (err) {
                msg.statusCode = err.statusCode;
                node.status({ fill: 'red', shape: 'ring', text: err.statusCode ? `HTTP ${err.statusCode}` : 'error' });
                done(err);
            }
        });

        node.on('close', () => node.status({}));
    }
    RED.nodes.registerType('apiverve', ApiverveNode);

    // The editor's API picker: id, title, category and parameters for every API.
    RED.httpAdmin.get('/apiverve/catalog', RED.auth.needsPermission('apiverve.read'), async (req, res) => {
        try {
            const apis = await getCatalog();
            res.json(Object.entries(apis).map(([id, a]) => ({
                id,
                title: a.title,
                category: a.category,
                method: a.method,
                params: (a.params || []).map((p) => ({ name: p.name, required: !!p.required, type: p.type, description: p.description, example: p.example })),
            })));
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });
};
