# Apps Script / Cloud Run request comparison

Observed October 21, 2026. Eight credential-free requests were received by
`https://ska-transport-probe-558742426345.us-west1.run.app/probe`: four from
Apps Script and four from a Cloud Run Node client. No SKA credentials, session
cookies, or authentication tokens were sent to this endpoint.

The cases were a default GET, a GET requesting a browser User-Agent, the same
GET with Apps Script URL escaping disabled, and a form POST. Both clients used
the fixtures in `TransportProbe.js`. Observations are exported in
[TRANSPORT-OBSERVATIONS.json](TRANSPORT-OBSERVATIONS.json).

## Measured results

| Property                         | Apps Script                                    | Cloud Run Node                                 |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Default received User-Agent      | Google-Apps-Script / beanserver identifier     | node                                           |
| Browser User-Agent requested     | Receiver still saw the Apps Script identifier  | Receiver saw the requested browser string      |
| Synthetic Cookie header          | Exact expected bytes in all four cases         | Exact expected bytes in all four cases         |
| Encoded query                    | Exact expected bytes in all four cases         | Exact expected bytes in all four cases         |
| Form POST body                   | Exact expected 52 bytes                        | Exact expected 52 bytes                        |
| Form Content-Type                | application/x-www-form-urlencoded              | application/x-www-form-urlencoded              |
| Accept                           | Absent                                         | _/_                                            |
| Accept-Language                  | Absent                                         | *                                              |
| Accept-Encoding                  | gzip, deflate, br                              | br, gzip, deflate                              |
| Sec-Fetch-Mode header            | Absent                                         | Present                                        |
| Received X-Forwarded-For entries | Two; first fingerprint constant, second varied | One; fingerprint constant across four requests |
| Received Forwarded header        | Present; fingerprint varied                    | Present; fingerprint constant                  |

The endpoint hashes each comma-separated forwarding entry instead of recording
its address. Unknown header values, authorization values, cookie values, raw
request URLs, and bodies are excluded from application observations. Cloud Run's
standard platform request logs can separately retain normal request metadata.

## What this establishes

The earlier Apps Script browser-agent test did not actually change the
User-Agent received by our endpoint. Consequently that test could not exclude
User-Agent-dependent behavior by the authentication provider or news site.

For the synthetic fixtures, Apps Script preserved the cookie, URL encoding, and
form bytes. This is evidence against generic corruption of those fields, not a
byte-by-byte capture of the real SKA requests or proof about every possible token.

Forwarding chains differ between clients. These observations are taken behind
Cloud Run's frontend: they do not establish which entries were inserted by the
caller infrastructure versus the receiving platform, nor which entry SKA uses
as a client IP. HTTP version at the container is also a frontend-to-container
property, not proof of the original client's TLS or HTTP negotiation.

## Sources and their limits

- [Google: URL Fetch Service](https://developers.google.com/apps-script/reference/url-fetch)
  documents the default User-Agent and outbound IP pool.
- [Google: UrlFetchApp reference](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)
  documents request headers, URL escaping, redirects, and getRequest. A prepared
  request is not a capture of what an external receiver observes.
- [Kanshi Tanaike: Pseudo Browser with Google Spreadsheet](https://tanaikech.github.io/2017/07/05/pseudo-browser-with-google-spreadsheet/)
  is an independent developer's original report, dated July 5, 2017, that the
  Apps Script User-Agent could not be changed. It is historical corroboration;
  the current receiver-side measurements above establish behavior for this test.
- [Apps Script Community: Adding a User Agent to UrlFetchApp](https://groups.google.com/g/google-apps-script-community/c/LzlVYGPTvXE)
  is a March 2020 discussion linking an unresolved feature request at that time.
  It does not establish current platform guarantees.

## Controlled follow-up

Cloud Run execution `ska-training-http-trace-bzj5s` compares two fresh logins:
first the previously successful browser User-Agent, then the exact Apps Script
User-Agent observed by this probe. It uses the same HTTP client and has no
browser. Both profiles succeeded and extracted the December 2026 syllabus.

| Profile           | Handoff result                          | Extraction |
| ----------------- | --------------------------------------- | ---------- |
| browser-control   | News root 302 to calendar; calendar 200 | Successful |
| apps-script-agent | News root 302 to calendar; calendar 200 | Successful |

Therefore the Apps Script User-Agent string **alone** does not reproduce the
failure from Cloud Run. This does not exclude interactions with other headers,
forwarding metadata, or network properties. It also does not establish that the
Apps Script request arrives identically at SKA and at our Cloud Run endpoint.

The next narrowly scoped header test would add the observed successful Node
Accept/Accept-Language/Sec-Fetch-Mode values to the Apps Script request, verifying
their receipt at the probe before retesting authentication. No finding here
proves that these header differences cause rejection; source IP interpretation
and other transport differences remain unresolved.

## Combined header-verification and login test

`testTrainingHttpNodeHeaders` requests `Accept: */*`, `Accept-Language: *`, and
`Sec-Fetch-Mode: cors`. It first sends a credential-free request to the probe
and verifies the three received values. If any differs, it stops before login.
If verification succeeds, it performs the same fresh SKA authentication and
December 2026 extraction with those headers on every request. The existing
browser-agent request and disabled-escaping settings are retained. This is a
comparison of the three headers together; success would require subsequent
isolation to determine which header mattered.

### Live combined-header result

The Apps Script run starting at 02:41:03 America/Los_Angeles on October 21, 2026
reported `training_header_verification.verified: true`. The receiver saw
`Accept: */*`, `Accept-Language: *`, and `Sec-Fetch-Mode: cors` unchanged.
Authentication nevertheless followed the same failure sequence: request 10
redirected from secure.ska.org to the news root, request 11 redirected from news
back to secure, and the flow ended on secure after request 14. Thus setting these
three headers is not a sufficient fix. There is no new evidence establishing
IP binding or its exact implementation.

## Cross-runtime authenticated-session result

The imported-session test succeeded from Apps Script with HTTP 200 and the
correct December 2026 syllabus, 66 seconds after Cloud Run minted the session.
Thus the current obstacle is establishing authentication through the handoff,
not an inability to fetch/parse the authenticated calendar in Apps Script.
This does not identify the token-validation rule or establish session longevity.
