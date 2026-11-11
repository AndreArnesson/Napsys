# Börsdata links

The company card resolves its Börsdata export URL through the `borsdata-link`
Edge Function. It searches by company name and ticker and uses the returned
`urlName`. For example, Cheffelo (`CHEF`) still uses `lmk-group`.

The function verifies the signed-in user with `getUser` and reads the company's
name, ticker, and exchange through the caller's RLS-scoped client. Owners and
current share recipients can resolve a link. No company data is modified.
Gateway JWT verification remains enabled.

Only name, ticker, country, market ID, and URL slug come from Börsdata's public
terminal search (`/api/terminal/instruments?name=…&take=40`). No financial report
data is fetched and no Börsdata API key is needed. This endpoint is used by the
public website rather than the documented subscription REST API; if it changes,
update `createInstrumentSearch` and `readInstruments` in the function's `core.ts`.
The request runs on the server because the endpoint does not allow cross-origin
browser requests.

Name and ticker must identify a unique instrument, taking the exchange/ticker
country into account when known. Conflicting or ambiguous results require the
user to choose the company/share class. A choice is kept in the current browser
session's query cache. A failed search offers retry and the Börsdata terminal;
it never falls back to inventing a URL from the ticker.

Public search results are cached in the function instance for up to 24 hours
(empty results for five minutes), with a maximum of 200 entries. Each upstream
request times out after eight seconds. Company access is checked on every call,
including when the upstream result is cached. The frontend also caches the
lookup per signed-in user, company, name, ticker, and exchange for 24 hours.

Deploy `borsdata-link` with `verify_jwt=true` before publishing the frontend.
There is no database migration or new secret. The functions and component are
covered by `src/lib/borsdataLink.test.ts` and
`src/components/company/BorsdataLink.test.tsx`.
