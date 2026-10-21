# Authentication trace findings

Cloud Run execution `ska-training-trace-cz8qf` completed successfully on
October 21, 2026. It logged 14 navigation requests, zero trace logging failures,
and extracted the December 2026 syllabus. Credentials came from Secret Manager
and were not printed. No recurring schedule was created.

## Observed sequence

| Request                                          | Response                                               | Cookie behavior                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Unauthenticated GET to the news calendar         | 302 to secure.ska.org                                  | News issues a PHPSESSID with Path=/, Secure, HttpOnly, SameSite=Strict, and no Domain attribute (host-only). |
| Follow membership-site redirects to login        | Login page returns 200                                 | Secure issues its own PHPSESSID, plus lang and country.                                                      |
| POST to secure.ska.org/en/account/login          | 302, followed by another 302 and a 200                 | Login issues a PHPSESSID and userid. The following requests send those cookies.                              |
| GET secure.ska.org/en/cfilters/news              | 302 to news.ska.org/ with src, id, ip, auth query keys | Request carries the secure-site cookies.                                                                     |
| GET the exact news authentication destination    | 302 to /calendars/calendar/                            | Browser sends the previously issued news PHPSESSID; response issues no cookies.                              |
| GET news calendar                                | 200                                                    | Browser sends the news PHPSESSID.                                                                            |
| GET calendar with calendar_month and calendar_yr | 200                                                    | Requested syllabus is available.                                                                             |

Both hosts also receive analytics cookies. The trace does not establish that
these or any other incidental cookies are required.

## Implications for Training.js

1. The browser establishes separate PHP sessions on the two hosts. Training.js
   keeps only the secure-site PHPSESSID and sends that value to the news site.
   Cookie-name equality does not make these sessions interchangeable.
2. The browser visits the original token-bearing news root URL. Training.js
   relocates the query parameters to the calendar path. Whether that alternate
   path can process the token has not been tested.
3. A redirect after visiting the token URL is part of the successful flow.
   Training.js instead treats a redirect on its final request as failure.
4. The successful browser flow GETs login and preserves cookies before POSTing.
   Training.js starts with a POST and discards all but one cookie afterward.

The news authentication response sets no new cookies in this run. A plausible
explanation is that it marks the existing news PHP session as authenticated
server-side, then redirects. Server-side behavior cannot be proven from these
logs, and cookie values were deliberately omitted, so the trace does not compare
session values or determine whether sessions rotate.

## Next experiment

An HTTP-only client should maintain cookies by domain/path, reproduce the
initial GET/login sequence, follow the exact authentication destination and its
redirects, then request the desired calendar month. That would test whether
browser JavaScript is necessary. The final proof for an Apps Script deployment
still requires running the equivalent requests from UrlFetchApp; Google Cloud
Run and Apps Script do not necessarily use the same outbound IP throughout a
flow. The auth URL has an ip parameter, but IP binding has not been established.

## Cloud resources

- Project: get-ska-events (558742426345)
- Region: us-west1
- Artifact Registry repository: ska-diagnostics
- Image: us-west1-docker.pkg.dev/get-ska-events/ska-diagnostics/training-trace:v1
- Cloud Run Job: ska-training-trace
- Job service account: ska-training-trace@get-ska-events.iam.gserviceaccount.com
- Secrets: ska-username and ska-password, mapped into the job environment
- Build: 357761a4-8879-4260-8b4f-8c40b253a181

Inspect execution logs using:

```sh
gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="ska-training-trace" AND labels."run.googleapis.com/execution_name"="ska-training-trace-cz8qf"' --project=get-ska-events --limit=200 --order=asc --format='json(timestamp,jsonPayload,textPayload)'
```

## First live Apps Script HTTP result

The initial UrlFetchApp experiment reached the handoff: request 10 to the secure
site returned 302 to news.ska.org. Request 11 sent the separately scoped news
PHPSESSID, but news returned 302 back to secure.ska.org. Requests 12–14 remained
on secure and ended with 200. Thus the failure is at news-side acceptance of the
handoff, rather than failure to obtain a news-directed redirect. The cause is
not established; the logs omit cookie/token values by design.

`testTrainingHttpBrowserAgent` repeats the same flow while requesting a
browser-style User-Agent header, to investigate a client-header difference.
The baseline test is retained. This does not change or stabilize outbound IPs,
and the trace does not verify the header as received by the server. UrlFetchApp
uses Google's outbound IP pool; whether the handoff validates its ip query
parameter against the request address remains unproven.

## HTTP-only Cloud Run comparison

Execution `ska-training-http-trace-7gx8x` completed successfully. It ran the same
Training.js login/cookie/redirect/parser functions through a synchronous Node
HTTP shim, with credentials supplied from the existing Secret Manager mappings.
No browser or page JavaScript was used. Request 11 at the news root redirected
to the calendar, and the December 2026 syllabus was extracted in 13 requests.
This proves that the handoff can work over ordinary HTTP. It does not yet
establish which Apps Script-specific behavior causes rejection.

The live Apps Script browser-agent variant also failed at request 11. The next
controlled variant, `testTrainingHttpExactUrl`, disables UrlFetchApp automatic
URL escaping while retaining the same requested User-Agent. All Apps Script
variants log a boolean comparing `getRequest().url` against the input URL, without
printing URLs or token values. If URL preparation is unchanged and this variant
fails, network/IP differences remain a leading hypothesis, not a proven cause.

## Apps Script URL-escaping result

The live `testTrainingHttpExactUrl` run also failed at the news root handoff.
All fourteen `training_url_check` entries reported `unchanged: true` and
`escapingDisabled: true`. Disabling escaping did not resolve the rejection.

The next diagnostic, `testTrainingHttpIpConsistency`, logs in once and asks the
membership handoff endpoint for four redirects without visiting their token
URLs. It compares the four provider-reported ip parameter values in memory and
logs only counts/equality. A count greater than one would establish that the
provider sees varying request IPs during one Apps Script execution. It would
support, but not prove, IP-bound authentication as the rejection cause. A count
of one would not establish the source IP used for subsequent news requests.

## Apps Script IP-consistency result

The live diagnostic returned:

```json
{
  "event": "training_handoff_ip_check",
  "requests": 4,
  "responsesWithIp": 4,
  "distinctIpCount": 2,
  "allMatch": false
}
```

Within one authenticated Apps Script execution, four sequential handoff requests
produced two distinct provider-reported ip parameter values. No raw IP addresses
or authentication tokens were logged. This establishes changing provider-observed
IP values, assuming the ip parameter represents the caller address as expected.
It does not show the exact source IP of the rejected news request or prove that
the news host compares that source IP against the token's ip field.

Together with successful browser and HTTP-only Cloud Run runs, and unsuccessful
Apps Script baseline, browser-agent, and disabled-escaping runs, this makes IP
binding a leading explanation and a practical obstacle to an Apps Script-only
solution. Do not attempt to alter the signed authentication URL's ip value or
spoof forwarding headers. Definitive confirmation would require the site's
validation code or server-side logs.

A smaller working alternative to Playwright is the tested HTTP-only Cloud Run
client. Production can move authentication and extraction into a small HTTP
service called by Apps Script, returning syllabus JSON; the current diagnostic
job does not itself provide that request/response interface. No production
service or recurring schedule has been created, and the successful comparison
run did not configure a guaranteed static outbound IP.

## Credential-free receiver-side comparison and User-Agent replay

See [TRANSPORT-COMPARISON.md](TRANSPORT-COMPARISON.md) and the exported
[observations](TRANSPORT-OBSERVATIONS.json). Apps Script ignored a requested
browser User-Agent at our probe, consistent with older independent developer
reports. Both clients preserved synthetic cookie/query/form bytes. Their other
default headers and received forwarding chains differed.

Execution `ska-training-http-trace-bzj5s` then completed two fresh Cloud Run
logins, one with the browser User-Agent and one with the exact received Apps
Script User-Agent. Both succeeded and extracted the syllabus. Thus the Apps
Script User-Agent alone does not explain rejection. This experiment does not
resolve IP binding or other infrastructure differences.

## Verified default-header comparison result

`testTrainingHttpNodeHeaders` verified all three requested headers at the probe
before logging in. The live Apps Script run still failed at the news handoff in
request 11. Changing Accept, Accept-Language, and Sec-Fetch-Mode together did not
resolve the rejection. Cookie/query/form synthetic fidelity, User-Agent replay,
and these header controls have not identified a working Apps Script-only fix.
Source/forwarding metadata, other transport behavior, and exact server-side
validation remain unresolved.

## Fresh news-session experiment prepared

`testTrainingHttpFreshNewsSession` retains the latest verified-header settings
and changes only the news cookie state before the handoff. It discards cookies
scoped specifically to news.ska.org while keeping the authenticated secure.ska.org
cookies, then follows the original token URL and accepts any newly issued news
cookies. The `training_cookie_reset` log records only the host and removed count.
This tests whether pre-login news session state contributes to rejection; it does
not alter signed token parameters or control source IP. A negative result alone
would not prove that a fresh destination session is supported by the site.

### Live fresh-news-session result

The Apps Script run starting at 02:44:39 America/Los_Angeles on October 21, 2026
removed one news cookie. Request 11 to the token-bearing news root sent no
cookies. News issued a new host-only PHPSESSID but returned 302 to secure.ska.org;
the run ended on secure after request 14. Discarding the pre-login news cookie
was therefore not a sufficient fix. This result does not show whether the newly
created news session was authenticated, and does not prove any IP check.

## Imported authenticated-session test prepared

Cloud Run will authenticate with the exact observed Apps Script User-Agent,
validate the requested December 2026 syllabus, and save only the news PHPSESSID
and mint timestamp in `ska-diagnostic-news-session`. Its account has
secretVersionAdder on that single temporary secret. The public probe never
receives this session.

`testTrainingImportedSession` reads the snapshot with the executing user's
existing Secret Manager access and makes one calendar request with redirects
disabled. It refuses snapshots older than 15 minutes. Cookie values remain in
memory/Secret Manager and are omitted from logs. The 15-minute check is a client
freshness check, not server-side session invalidation or automatic secret deletion.

Success would show that Apps Script can use an externally authenticated session,
narrowing the issue to session establishment/handoff. Failure would show that the
session cannot be used in this cross-runtime test, but would not distinguish IP,
other client binding, expiration, or intermediary restrictions by itself.

### Live imported-session result: success

On October 21, 2026 at 02:51:35 America/Los_Angeles, Apps Script logged:

```json
{ "event": "training_imported_session", "status": 200, "ageSeconds": 66 }
```

It successfully parsed the expected December 2026 syllabus using the news cookie
minted by Cloud Run 66 seconds earlier. No token redemption or membership login
was performed by Apps Script in this test. The cookie was not printed.

This demonstrates that an authenticated news session can cross these runtimes
and be used by UrlFetchApp for calendar extraction in the tested conditions.
It argues against a blanket Apps Script block and against strict source-IP
binding of this particular authenticated session. It does not prove which
validation rejects the TrustDriven-to-news handoff or guarantee future session
lifetimes. A token-specific IP validation rule remains plausible but unproven.

The investigation is now localized to session establishment/token redemption.
A minimal hybrid could have Cloud Run establish a news session and Apps Script
fetch/parse the syllabus, rather than requiring browser automation or remote
extraction. Keeping a cached cookie alone would still require handling expiration;
the experiment did not measure how long the news session remains valid.
