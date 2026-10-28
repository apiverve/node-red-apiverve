'use strict';

const helper = require('node-red-node-test-helper');
const should = require('should');
const apiverveNode = require('../nodes/apiverve.js');
const client = require('../lib/client');

helper.init(require.resolve('node-red'));

const CATALOG = {
    apiBase: 'https://api.apiverve.com',
    apis: {
        emailvalidator: { title: 'Email Validator', category: 'Data Validation', method: 'GET', path: '/v1/emailvalidator', params: [{ name: 'email', in: 'query', required: true }] },
        htmltopdf: { title: 'HTML to PDF', category: 'Documents', method: 'POST', path: '/v1/htmltopdf', params: [{ name: 'html', in: 'body', required: true }, { name: 'landscape', in: 'body' }] },
    },
};

let calls;
function mockFetch(handler) {
    calls = [];
    global.fetch = async (url, init = {}) => {
        const u = String(url);
        if (u === client.CATALOG_URL) return new Response(JSON.stringify(CATALOG), { status: 200 });
        calls.push({ url: new URL(u), init });
        return handler(new URL(u), init);
    };
}
const ok = (data, credits = '999') => new Response(JSON.stringify({ status: 'ok', error: null, data }), { status: 200, headers: { 'x-api-remaining-credits': credits } });

function flow(extra = {}) {
    return [
        { id: 'c1', type: 'apiverve-config', name: 'APIVerve' },
        { id: 'n1', type: 'apiverve', account: 'c1', api: 'emailvalidator', params: '', output: 'data', wires: [['h1']], ...extra },
        { id: 'h1', type: 'helper' },
    ];
}
const creds = { c1: { apiKey: 'test-key-1234' } };

describe('apiverve node', function () {
    const realFetch = global.fetch;
    beforeEach(() => client.resetCatalog());
    afterEach(async () => {
        global.fetch = realFetch;
        await helper.unload();
    });

    it('loads', async function () {
        await helper.load(apiverveNode, flow(), creds);
        should.exist(helper.getNode('n1'));
    });

    it('fills the only required param from a plain payload and returns data', async function () {
        mockFetch(() => ok({ isValid: true }));
        await helper.load(apiverveNode, flow(), creds);
        const out = new Promise((resolve) => helper.getNode('h1').on('input', resolve));
        helper.getNode('n1').receive({ payload: 'a@b.com' });
        const msg = await out;
        msg.payload.should.eql({ isValid: true });
        msg.statusCode.should.equal(200);
        msg.apiverve.should.eql({ api: 'emailvalidator', remainingCredits: 999 });
        calls[0].url.pathname.should.equal('/v1/emailvalidator');
        calls[0].url.searchParams.get('email').should.equal('a@b.com');
        calls[0].init.headers['x-api-key'].should.equal('test-key-1234');
        calls[0].init.redirect.should.equal('error');
    });

    it('merges node params, payload and msg.params in that order', async function () {
        mockFetch(() => ok({}));
        await helper.load(apiverveNode, flow({ params: '{"email":"node@x.com","extra":"1"}' }), creds);
        const out = new Promise((resolve) => helper.getNode('h1').on('input', resolve));
        helper.getNode('n1').receive({ payload: { email: 'payload@x.com' }, params: { extra: '2' } });
        await out;
        calls[0].url.searchParams.get('email').should.equal('payload@x.com');
        calls[0].url.searchParams.get('extra').should.equal('2');
    });

    it('sends POST params as a JSON body and honours msg.api', async function () {
        mockFetch(() => ok({ url: 'https://cdn/x.pdf' }));
        await helper.load(apiverveNode, flow({ output: 'full' }), creds);
        const out = new Promise((resolve) => helper.getNode('h1').on('input', resolve));
        helper.getNode('n1').receive({ api: 'htmltopdf', payload: { html: '<p>hi</p>', landscape: true } });
        const msg = await out;
        msg.payload.status.should.equal('ok');
        calls[0].init.method.should.equal('POST');
        JSON.parse(calls[0].init.body).should.eql({ html: '<p>hi</p>', landscape: true });
    });

    it('reports a rejected key to the catch path with statusCode 401', async function () {
        mockFetch(() => new Response(JSON.stringify({ status: 'error', error: 'Invalid key' }), { status: 401 }));
        await helper.load(apiverveNode, flow(), creds);
        const n1 = helper.getNode('n1');
        const errored = new Promise((resolve) => { n1.error = (err, msg) => resolve({ err, msg }); });
        n1.receive({ payload: 'a@b.com' });
        const { err, msg } = await errored;
        String(err).should.match(/rejected the API key/);
        msg.statusCode.should.equal(401);
    });

    it('fails clearly with no key and never calls the API', async function () {
        const saved = process.env.APIVERVE_API_KEY;
        delete process.env.APIVERVE_API_KEY;
        mockFetch(() => ok({}));
        await helper.load(apiverveNode, flow(), {});
        const n1 = helper.getNode('n1');
        const errored = new Promise((resolve) => { n1.error = (err) => resolve(err); });
        n1.receive({ payload: 'a@b.com' });
        String(await errored).should.match(/No API key/);
        calls.length.should.equal(0);
        if (saved !== undefined) process.env.APIVERVE_API_KEY = saved;
    });

    it('rejects an unknown API id', async function () {
        mockFetch(() => ok({}));
        await helper.load(apiverveNode, flow({ api: 'nope' }), creds);
        const n1 = helper.getNode('n1');
        const errored = new Promise((resolve) => { n1.error = (err) => resolve(err); });
        n1.receive({ payload: 'x' });
        String(await errored).should.match(/Unknown API "nope"/);
        calls.length.should.equal(0);
    });
});
