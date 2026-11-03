# OSINT Atlas

A static, client-side workbench for open-source intelligence research. You don't need a server, accounts or a build step, and it doesn't track you.

## Features

**Pivot launcher**: paste any indicator and Atlas detects its type, refangs defanged input (`hxxps://evil[.]example`), and lists about 120 deep links into public services, grouped by what each one tells you.

| Type | Examples of where it pivots |
| --- | --- |
| Domain | ICANN RDAP, crt.sh, SecurityTrails, VirusTotal, urlscan, Shodan, Wayback |
| IP address | IPinfo, BGP toolkit, Shodan, Censys, AbuseIPDB, GreyNoise, reverse IP |
| Email | Breach checks, mentions, mail-domain checks; pivots to its domain and username |
| URL | VirusTotal, URLhaus, Wayback, archive.today |
| Username | WhatsMyName plus 25+ direct profile URLs, including Roblox, Steam, Minecraft (NameMC), Xbox and a Discord web search. Legacy Discord tags like `name#1234` are recognised |
| File hash | VirusTotal, MalwareBazaar, Hybrid Analysis, OTX, ThreatFox |
| Coordinates | Maps, satellite & street-level imagery, SunCalc, nearby flights and ships |
| Post / snowflake ID | Decoded creation time for X, Discord, Mastodon, TikTok; Discord profile and DiscordLookup by user ID; Steam profile for Steam64 IDs |
| Numeric account ID | Roblox profile, Rolimons player stats, Roblox game by place ID |
| Keyword / name | Search engines, company registries, sanctions and leak databases |

Links that need you to paste the value are tagged **paste**. Links visible to others or to the target are tagged **active**.

**Toolbox**: nine utilities that run in the browser:

- **Domain & IP intel**: live DNS (DNS-over-HTTPS), RDAP registration data, SPF/DMARC posture, domain-age and hold-status flags. It queries Google Public DNS (Cloudflare as fallback) and rdap.org, never the target.
- **Breach check**:
  - Rates a password's strength as you type. This happens entirely in the browser and catches common passwords, sequences, years and common words.
  - Checks whether the password has leaked, using Have I Been Pwned's [k-anonymity range API](https://haveibeenpwned.com/API/v3#PwnedPasswords). Only the first 5 characters of the SHA-1 hash are sent, and the password is never stored.
  - Lists the breaches Have I Been Pwned has recorded for a website (e.g. `discord.com`).
  - Copies your email and opens Have I Been Pwned or Mozilla Monitor, which verify the address is yours.

  Together with Domain & IP intel, these are the only tools that make network requests.
- **Image metadata**: EXIF reader for camera, lens, serial numbers, capture time, editing software and GPS. GPS coordinates feed straight into the coordinates pivot.
- **IOC extractor**: pulls IPv4/IPv6, domains, URLs, emails, MD5/SHA-1/SHA-256/SHA-512, CVEs, and BTC/ETH addresses out of any text. It dedupes them and can defang the output.
- **Dork builder**: compose search-operator queries with presets, and run them on Google, Bing, DuckDuckGo or Yandex.
- **Email header analyzer**: orders relay hops, measures delays, finds the origin IP, and flags SPF/DKIM/DMARC failures and Reply-To, Return-Path or Message-ID mismatches.
- **Hash generator**: MD5, SHA-1, SHA-256 and SHA-512 for text or files, without uploading anything.
- **Encode / decode**: Base64 (incl. URL-safe), URL, hex, JWT, ROT13, HTML entities, Unicode escapes, binary, defang/refang.
- **Time & ID decoder**: Unix timestamps (s/ms/µs/ns, auto-detected) and snowflake IDs.

**Directory**: 94 curated tools across 15 categories, including gaming & chat and breaches & passwords. It's searchable and filterable by access model (free, freemium, open source).

**Case notebook**: log entities (one click from any pivot result) and notes. Saved in `localStorage`, with Markdown and JSON export and JSON import.

**Method**: the intelligence cycle, a persistent OPSEC checklist, and ethics and legal guidance.

## Running it

Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Serving over `http://localhost` or HTTPS is recommended: the browser only allows Web Crypto (SHA hashes) in a secure context.

### Deploying

The site is plain static files, so any static host works. On GitHub Pages: **Settings → Pages → Deploy from a branch**, then pick the branch and `/ (root)`. A `.nojekyll` file is included.

Deep link to a pivot with `#q=<value>`, e.g. `index.html#q=example.com`.

## Project layout

```
index.html              page structure and icon sprite
assets/css/style.css    design tokens (light + dark), layout, components
assets/js/theme.js      applies the saved theme before first paint
assets/js/core.js       DOM helpers, storage, clipboard, indicator detection, refang/defang
assets/js/data.js       pivot templates, tool directory, OPSEC checklist, dork presets
assets/js/app.js        theme toggle, navigation, pivot launcher, directory, notebook
assets/js/tools.js      the nine toolbox utilities
assets/js/lib/md5.js    MD5 (Web Crypto has none; malware databases still index by it)
assets/js/lib/exif.js   minimal JPEG/TIFF EXIF parser
```

To add a directory entry, append a row to the `T` array in `assets/js/data.js`. To add a pivot, add an item to the relevant group in `pivots`.

## Privacy & security

- A strict Content-Security-Policy allows scripts only from the site itself, and `no-referrer` is set everywhere.
- Every value from user input or third-party responses is HTML-escaped before rendering.
- Pasted text, dropped files and notebook contents stay in your browser.
- Third-party links open in a new tab with `noopener noreferrer`. The service you click receives your query and IP address, so plan your OPSEC accordingly.

## Responsible use

Use OSINT Atlas only for lawful, legitimate purposes such as security research, journalism, due diligence and incident response. Don't use it to harass, stalk, dox or intimidate anyone. Collect only what you need, respect platform terms, and verify findings before you act on them or publish them.
