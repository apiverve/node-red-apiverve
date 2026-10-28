# @apiverve/node-red-apiverve

A [Node-RED](https://nodered.org) node for [APIVerve](https://apiverve.com): call any of 380+ APIs with one API key. Validate emails and phone numbers, look up IPs and domains, get weather, currency rates, DNS records, generate PDFs and QR codes, and more.

## Install

From the Node-RED editor: **Menu → Manage palette → Install**, search for `@apiverve/node-red-apiverve`.

Or from your Node-RED user directory (usually `~/.node-red`):

```sh
npm install @apiverve/node-red-apiverve
```

Requires Node-RED 3.0+ and Node.js 18+.

## Set up

1. Get a free API key at [dashboard.apiverve.com](https://dashboard.apiverve.com).
2. Drag an **apiverve** node (Network section) into a flow and open it.
3. Add an **Account** with your key, then pick an API from the list. The editor shows that API's parameters.

The key is stored as a Node-RED credential and is not exported with your flows. Leave it empty to use the `APIVERVE_API_KEY` environment variable instead.

## Use

Send parameters in `msg.payload`:

```json
{ "email": "support@myspace.com" }
```

A plain value fills the API's only required parameter, so an inject node can send just an email address, an IP or a domain.

| Input | |
|---|---|
| `msg.payload` | Parameters as an object, or a plain value for the one required parameter |
| `msg.params` | More parameters, applied last |
| `msg.api` | An API id (e.g. `iplookup`) overriding the node's choice |

| Output | |
|---|---|
| `msg.payload` | The API's `data` (or the full response, if Output is set to full) |
| `msg.statusCode` | HTTP status |
| `msg.apiverve` | `{ api, remainingCredits }` |

Parameters set in the node, then `msg.payload`, then `msg.params` are merged in that order.

Errors go to a **Catch** node with `msg.statusCode` set: `401` invalid key, `403` key not allowed for this call, `429` rate limit or no credits left.

## Example

**Menu → Import → Examples → @apiverve/node-red-apiverve → validate-an-email** imports an inject → apiverve → debug flow.

## Links

- Browse every API: [apiverve.com/marketplace](https://apiverve.com/marketplace)
- Docs: [docs.apiverve.com](https://docs.apiverve.com)
- Plans and credits: [apiverve.com/pricing](https://apiverve.com/pricing)

## License

MIT
