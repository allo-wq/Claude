/* OSINT Atlas — curated data: indicator types, pivot templates, tool directory, checklists. */
(function () {
  'use strict';

  const e = encodeURIComponent;
  const q = (s) => e(`"${s}"`);

  /* ---------- indicator types ---------- */
  const types = {
    domain: { label: 'Domain', notebook: true },
    ip: { label: 'IP address', notebook: true },
    email: { label: 'Email', notebook: true },
    url: { label: 'URL', notebook: true },
    username: { label: 'Username', notebook: true },
    hash: { label: 'File hash', notebook: true },
    coords: { label: 'Coordinates', notebook: true },
    snowflake: { label: 'Post / snowflake ID', notebook: true },
    keyword: { label: 'Keyword / name', notebook: true },
  };

  /* ---------- pivot templates ----------
     Each item: { name, desc, url(d) } where d = { value, ctx }.
     manual: true  → the site has no deep link; clicking copies the value so it can be pasted.
     active: true  → the action is visible to others (public submission or a live request). */
  const pivots = {
    domain: [
      { group: 'Registration', items: [
        { name: 'ICANN Lookup', desc: 'Official registration data', url: (d) => `https://lookup.icann.org/en/lookup?name=${e(d.value)}` },
        { name: 'who.is', desc: 'WHOIS & registrar', url: (d) => `https://who.is/whois/${e(d.value)}` },
        { name: 'DomainTools', desc: 'WHOIS & hosting history', url: (d) => `https://whois.domaintools.com/${e(d.value)}` },
      ] },
      { group: 'DNS & subdomains', items: [
        { name: 'crt.sh', desc: 'Certificates incl. subdomains', url: (d) => `https://crt.sh/?q=${e('%.' + d.value)}` },
        { name: 'SecurityTrails', desc: 'Current & historical DNS', url: (d) => `https://securitytrails.com/domain/${e(d.value)}/dns` },
        { name: 'ViewDNS IP history', desc: 'Past A records', url: (d) => `https://viewdns.info/iphistory/?domain=${e(d.value)}` },
        { name: 'DNSDumpster', desc: 'Passive DNS map', url: () => 'https://dnsdumpster.com/', manual: true },
      ] },
      { group: 'Reputation', items: [
        { name: 'VirusTotal', desc: 'Detections & relations', url: (d) => `https://www.virustotal.com/gui/domain/${e(d.value)}` },
        { name: 'urlscan.io', desc: 'Past scans of the site', url: (d) => `https://urlscan.io/domain/${e(d.value)}` },
        { name: 'AlienVault OTX', desc: 'Threat pulses', url: (d) => `https://otx.alienvault.com/indicator/domain/${e(d.value)}` },
        { name: 'URLhaus', desc: 'Malware distribution', url: (d) => `https://urlhaus.abuse.ch/browse.php?search=${e(d.value)}` },
      ] },
      { group: 'Infrastructure', items: [
        { name: 'Shodan', desc: 'Exposed services', url: (d) => `https://www.shodan.io/search?query=${e('hostname:' + d.value)}` },
        { name: 'Censys', desc: 'Hosts & certificates', url: (d) => `https://search.censys.io/search?resource=hosts&q=${e(d.value)}` },
        { name: 'BuiltWith', desc: 'Tech stack & tracking IDs', url: (d) => `https://builtwith.com/${e(d.value)}` },
      ] },
      { group: 'Archives & search', items: [
        { name: 'Wayback Machine', desc: 'Every archived URL', url: (d) => `https://web.archive.org/web/*/${d.value}*` },
        { name: 'archive.today', desc: 'Snapshots', url: (d) => `https://archive.ph/${e(d.value)}` },
        { name: 'Google site:', desc: 'Indexed pages', url: (d) => `https://www.google.com/search?q=${e('site:' + d.value)}` },
        { name: 'Google subdomains', desc: 'site:*.domain -www', url: (d) => `https://www.google.com/search?q=${e(`site:*.${d.value} -site:www.${d.value}`)}` },
        { name: 'GitHub code', desc: 'Mentions in public code', url: (d) => `https://github.com/search?type=code&q=${q(d.value)}` },
      ] },
    ],

    ip: [
      { group: 'Ownership & routing', items: [
        { name: 'IPinfo', desc: 'ASN, org, geolocation', url: (d) => `https://ipinfo.io/${e(d.value)}` },
        { name: 'HE BGP Toolkit', desc: 'Prefix & peers', url: (d) => `https://bgp.he.net/ip/${e(d.value)}` },
        { name: 'RIPEstat', desc: 'Routing & registry history', url: (d) => `https://stat.ripe.net/app/${e(d.value)}` },
      ] },
      { group: 'Exposure', items: [
        { name: 'Shodan', desc: 'Open ports & banners', url: (d) => `https://www.shodan.io/host/${e(d.value)}` },
        { name: 'Censys', desc: 'Services & certificates', url: (d) => `https://search.censys.io/hosts/${e(d.value)}` },
        { name: 'FOFA', desc: 'Cyberspace search', url: (d) => `https://en.fofa.info/result?qbase64=${e(btoa(`ip="${d.value}"`))}` },
      ] },
      { group: 'Reputation', items: [
        { name: 'AbuseIPDB', desc: 'Abuse reports', url: (d) => `https://www.abuseipdb.com/check/${e(d.value)}` },
        { name: 'GreyNoise', desc: 'Scanner or benign?', url: (d) => `https://viz.greynoise.io/ip/${e(d.value)}` },
        { name: 'VirusTotal', desc: 'Detections & resolutions', url: (d) => `https://www.virustotal.com/gui/ip-address/${e(d.value)}` },
        { name: 'AlienVault OTX', desc: 'Threat pulses', url: (d) => `https://otx.alienvault.com/indicator/ip/${e(d.value)}` },
        { name: 'ThreatFox', desc: 'IOC database', url: (d) => `https://threatfox.abuse.ch/browse.php?search=${e('ioc:' + d.value)}` },
      ] },
      { group: 'Neighbours', items: [
        { name: 'ViewDNS reverse IP', desc: 'Domains on this IP', url: (d) => `https://viewdns.info/reverseip/?host=${e(d.value)}&t=1` },
        { name: 'Bing ip:', desc: 'Sites indexed on this IP', url: (d) => `https://www.bing.com/search?q=${e('ip:' + d.value)}` },
      ] },
    ],

    email: [
      { group: 'Exposure & accounts', items: [
        { name: 'Have I Been Pwned', desc: 'Known breaches', url: () => 'https://haveibeenpwned.com/', manual: true },
        { name: 'Epieos', desc: 'Linked accounts', url: () => 'https://epieos.com/', manual: true },
        { name: 'Hunter verifier', desc: 'Deliverability check', url: (d) => `https://hunter.io/email-verifier/${e(d.value)}` },
        { name: 'Intelligence X', desc: 'Pastes, leaks, archives', url: (d) => `https://intelx.io/?s=${e(d.value)}` },
      ] },
      { group: 'Mentions', items: [
        { name: 'Google', desc: 'Exact match', url: (d) => `https://www.google.com/search?q=${q(d.value)}` },
        { name: 'Bing', desc: 'Exact match', url: (d) => `https://www.bing.com/search?q=${q(d.value)}` },
        { name: 'DuckDuckGo', desc: 'Exact match', url: (d) => `https://duckduckgo.com/?q=${q(d.value)}` },
        { name: 'GitHub code', desc: 'Commits & configs', url: (d) => `https://github.com/search?type=code&q=${q(d.value)}` },
      ] },
      { group: 'Mail domain', items: [
        { name: 'MX Toolbox', desc: 'MX & blacklist checks', url: (d) => `https://mxtoolbox.com/SuperTool.aspx?action=${e('mx:' + (d.ctx.domain || ''))}&run=toolpage` },
        { name: 'Hunter domain search', desc: 'Email format at org', url: (d) => `https://hunter.io/search/${e(d.ctx.domain || '')}` },
      ] },
    ],

    url: [
      { group: 'Analyse', items: [
        { name: 'VirusTotal', desc: 'URL reputation', url: (d) => `https://www.virustotal.com/gui/search/${e(e(d.value))}` },
        { name: 'URLhaus', desc: 'Malware distribution', url: (d) => `https://urlhaus.abuse.ch/browse.php?search=${e(d.value)}` },
        { name: 'urlscan.io', desc: 'Scans of this host', url: (d) => `https://urlscan.io/domain/${e(d.ctx.host || '')}` },
      ] },
      { group: 'Archives', items: [
        { name: 'Wayback Machine', desc: 'Captures of this URL', url: (d) => `https://web.archive.org/web/*/${d.value}` },
        { name: 'archive.today', desc: 'Newest snapshot', url: (d) => `https://archive.ph/newest/${d.value}` },
        { name: 'Save to Wayback', desc: 'Capture it now', url: (d) => `https://web.archive.org/save/${d.value}`, active: true },
      ] },
      { group: 'Mentions', items: [
        { name: 'Google', desc: 'Pages citing this URL', url: (d) => `https://www.google.com/search?q=${q(d.value)}` },
        { name: 'Reddit', desc: 'Shared on Reddit', url: (d) => `https://www.reddit.com/search/?q=${e('url:' + d.value)}` },
      ] },
    ],

    username: [
      { group: 'Check everywhere', items: [
        { name: 'WhatsMyName', desc: '600+ sites at once', url: (d) => `https://whatsmyname.app/?q=${e(d.value)}` },
        { name: 'Namechk', desc: 'Availability across sites', url: () => 'https://namechk.com/', manual: true },
        { name: 'Google', desc: 'Exact match', url: (d) => `https://www.google.com/search?q=${q(d.value)}` },
      ] },
      { group: 'Social', items: [
        { name: 'X', url: (d) => `https://x.com/${e(d.value)}` },
        { name: 'Instagram', url: (d) => `https://www.instagram.com/${e(d.value)}/` },
        { name: 'TikTok', url: (d) => `https://www.tiktok.com/@${e(d.value)}` },
        { name: 'Threads', url: (d) => `https://www.threads.com/@${e(d.value)}` },
        { name: 'Bluesky', url: (d) => `https://bsky.app/profile/${d.value.includes('.') ? e(d.value) : e(d.value) + '.bsky.social'}` },
        { name: 'Facebook', url: (d) => `https://www.facebook.com/${e(d.value)}` },
        { name: 'Reddit', url: (d) => `https://www.reddit.com/user/${e(d.value)}` },
        { name: 'YouTube', url: (d) => `https://www.youtube.com/@${e(d.value)}` },
        { name: 'Twitch', url: (d) => `https://www.twitch.tv/${e(d.value)}` },
        { name: 'Telegram', url: (d) => `https://t.me/${e(d.value)}` },
        { name: 'Pinterest', url: (d) => `https://www.pinterest.com/${e(d.value)}/` },
        { name: 'LinkedIn', desc: 'May notify the profile owner', url: (d) => `https://www.linkedin.com/in/${e(d.value)}`, active: true },
      ] },
      { group: 'Tech & other', items: [
        { name: 'GitHub', url: (d) => `https://github.com/${e(d.value)}` },
        { name: 'GitLab', url: (d) => `https://gitlab.com/${e(d.value)}` },
        { name: 'Keybase', url: (d) => `https://keybase.io/${e(d.value)}` },
        { name: 'Hacker News', url: (d) => `https://news.ycombinator.com/user?id=${e(d.value)}` },
        { name: 'Medium', url: (d) => `https://medium.com/@${e(d.value)}` },
        { name: 'Steam', url: (d) => `https://steamcommunity.com/id/${e(d.value)}` },
        { name: 'Linktree', url: (d) => `https://linktr.ee/${e(d.value)}` },
      ] },
    ],

    hash: [
      { group: 'Malware databases', items: [
        { name: 'VirusTotal', desc: 'Detections & behaviour', url: (d) => `https://www.virustotal.com/gui/file/${e(d.value)}` },
        { name: 'MalwareBazaar', desc: 'Samples & signatures', url: (d) => d.ctx.algo === 'sha256'
          ? `https://bazaar.abuse.ch/sample/${e(d.value)}/`
          : `https://bazaar.abuse.ch/browse.php?search=${e(`${d.ctx.algo}:${d.value}`)}` },
        { name: 'Hybrid Analysis', desc: 'Sandbox reports', url: (d) => `https://www.hybrid-analysis.com/search?query=${e(d.value)}` },
        { name: 'AlienVault OTX', desc: 'Threat pulses', url: (d) => `https://otx.alienvault.com/indicator/file/${e(d.value)}` },
        { name: 'ThreatFox', desc: 'IOC database', url: (d) => `https://threatfox.abuse.ch/browse.php?search=${e('ioc:' + d.value)}` },
      ] },
      { group: 'Mentions', items: [
        { name: 'Google', desc: 'Reports citing the hash', url: (d) => `https://www.google.com/search?q=${q(d.value)}` },
        { name: 'GitHub code', desc: 'Detection rules & IOC lists', url: (d) => `https://github.com/search?type=code&q=${e(d.value)}` },
      ] },
    ],

    coords: [
      { group: 'Maps', items: [
        { name: 'Google Maps', url: (d) => `https://www.google.com/maps/search/?api=1&query=${d.ctx.lat},${d.ctx.lon}` },
        { name: 'OpenStreetMap', url: (d) => `https://www.openstreetmap.org/?mlat=${d.ctx.lat}&mlon=${d.ctx.lon}#map=17/${d.ctx.lat}/${d.ctx.lon}` },
        { name: 'Bing Maps', desc: 'Aerial view', url: (d) => `https://www.bing.com/maps?cp=${d.ctx.lat}~${d.ctx.lon}&lvl=17&style=h` },
        { name: 'Apple Maps', url: (d) => `https://maps.apple.com/?ll=${d.ctx.lat},${d.ctx.lon}&q=Pin` },
      ] },
      { group: 'Imagery & street level', items: [
        { name: 'Google Earth', desc: '3D imagery', url: (d) => `https://earth.google.com/web/@${d.ctx.lat},${d.ctx.lon},0a,1000d,35y,0h,0t,0r` },
        { name: 'Copernicus Browser', desc: 'Recent Sentinel imagery', url: (d) => `https://browser.dataspace.copernicus.eu/?zoom=14&lat=${d.ctx.lat}&lng=${d.ctx.lon}` },
        { name: 'Street View', url: (d) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${d.ctx.lat},${d.ctx.lon}` },
        { name: 'Mapillary', desc: 'Crowdsourced street imagery', url: (d) => `https://www.mapillary.com/app/?lat=${d.ctx.lat}&lng=${d.ctx.lon}&z=17` },
        { name: 'Wikimapia', desc: 'Annotated places', url: (d) => `https://wikimapia.org/#lat=${d.ctx.lat}&lon=${d.ctx.lon}&z=17` },
      ] },
      { group: 'Context', items: [
        { name: 'SunCalc', desc: 'Sun angle & shadows', url: (d) => `https://www.suncalc.org/#/${d.ctx.lat},${d.ctx.lon},17/null/null/null/null` },
        { name: 'Overpass Turbo', desc: 'Query OSM features here', url: (d) => `https://overpass-turbo.eu/?C=${d.ctx.lat};${d.ctx.lon};17` },
        { name: 'Flightradar24', desc: 'Air traffic nearby', url: (d) => `https://www.flightradar24.com/${d.ctx.lat.toFixed(2)},${d.ctx.lon.toFixed(2)}/12` },
        { name: 'ADS-B Exchange', desc: 'Unfiltered air traffic', url: (d) => `https://globe.adsbexchange.com/?lat=${d.ctx.lat}&lon=${d.ctx.lon}&zoom=11` },
        { name: 'MarineTraffic', desc: 'Vessels nearby', url: (d) => `https://www.marinetraffic.com/en/ais/home/centerx:${d.ctx.lon}/centery:${d.ctx.lat}/zoom:12` },
      ] },
    ],

    snowflake: [
      { group: 'Open', items: [
        { name: 'X post', desc: 'If this is a post ID', url: (d) => `https://x.com/i/web/status/${e(d.value)}` },
        { name: 'Google', desc: 'Exact match', url: (d) => `https://www.google.com/search?q=${q(d.value)}` },
      ] },
    ],

    keyword: [
      { group: 'Search engines', items: [
        { name: 'Google', desc: 'Exact phrase', url: (d) => `https://www.google.com/search?q=${q(d.value)}` },
        { name: 'Bing', desc: 'Exact phrase', url: (d) => `https://www.bing.com/search?q=${q(d.value)}` },
        { name: 'DuckDuckGo', desc: 'Exact phrase', url: (d) => `https://duckduckgo.com/?q=${q(d.value)}` },
        { name: 'Yandex', desc: 'Exact phrase', url: (d) => `https://yandex.com/search/?text=${q(d.value)}` },
        { name: 'Wikipedia', url: (d) => `https://en.wikipedia.org/w/index.php?search=${e(d.value)}` },
      ] },
      { group: 'Companies & records', items: [
        { name: 'OpenCorporates', desc: 'Company registries', url: (d) => `https://opencorporates.com/companies?q=${e(d.value)}` },
        { name: 'OpenSanctions', desc: 'Sanctions & PEPs', url: (d) => `https://www.opensanctions.org/search/?q=${e(d.value)}` },
        { name: 'ICIJ Offshore Leaks', desc: 'Offshore entities', url: (d) => `https://offshoreleaks.icij.org/search?q=${e(d.value)}` },
        { name: 'OCCRP Aleph', desc: 'Leaks & registries', url: (d) => `https://aleph.occrp.org/search?q=${e(d.value)}` },
        { name: 'SEC EDGAR', desc: 'US filings full text', url: (d) => `https://www.sec.gov/edgar/search/#/q=${q(d.value)}` },
        { name: 'GLEIF', desc: 'Legal entity IDs', url: (d) => `https://search.gleif.org/#/search/simpleSearch=${e(d.value)}` },
      ] },
      { group: 'Social & news', items: [
        { name: 'Reddit', url: (d) => `https://www.reddit.com/search/?q=${q(d.value)}` },
        { name: 'Bluesky', url: (d) => `https://bsky.app/search?q=${q(d.value)}` },
        { name: 'Google News', url: (d) => `https://news.google.com/search?q=${q(d.value)}` },
        { name: 'GitHub code', url: (d) => `https://github.com/search?type=code&q=${q(d.value)}` },
      ] },
    ],
  };

  /* ---------- directory ---------- */
  const categories = [
    { id: 'search', label: 'Search & dorking' },
    { id: 'social', label: 'Usernames & social' },
    { id: 'email', label: 'Email' },
    { id: 'domain', label: 'Domains & DNS' },
    { id: 'infra', label: 'IP & infrastructure' },
    { id: 'threat', label: 'Threat intel' },
    { id: 'image', label: 'Images & video' },
    { id: 'geo', label: 'Maps & geolocation' },
    { id: 'transport', label: 'Flights & ships' },
    { id: 'archive', label: 'Archives' },
    { id: 'records', label: 'Companies & records' },
    { id: 'code', label: 'Code & web' },
    { id: 'learn', label: 'Guides & frameworks' },
  ];

  const access = [
    { id: 'all', label: 'All' },
    { id: 'free', label: 'Free' },
    { id: 'freemium', label: 'Freemium' },
    { id: 'oss', label: 'Open source' },
  ];

  // [name, url, category, access, description]
  const T = [
    ['Google Advanced Search', 'https://www.google.com/advanced_search', 'search', 'free', 'Form-based builder for precise Google queries by phrase, site, file type and date.'],
    ['Google Hacking Database', 'https://www.exploit-db.com/google-hacking-database', 'search', 'free', 'Catalogue of search-engine dorks grouped by what they expose.'],
    ['Bing', 'https://www.bing.com', 'search', 'free', 'A different index from Google; supports the handy ip: operator for co-hosted sites.'],
    ['Yandex', 'https://yandex.com', 'search', 'free', 'Strong coverage of Russian-language and Eastern European web content.'],
    ['DuckDuckGo', 'https://duckduckgo.com', 'search', 'free', 'Private search with !bang shortcuts that jump straight into hundreds of sites.'],
    ['Intelligence X', 'https://intelx.io', 'search', 'freemium', 'Search engine and archive over domains, emails, pastes, leaks and darknet sites.'],

    ['WhatsMyName', 'https://whatsmyname.app', 'social', 'free', 'Checks a username across 600+ sites using the community-maintained WMN dataset.'],
    ['Sherlock', 'https://github.com/sherlock-project/sherlock', 'social', 'oss', 'Command-line tool that hunts a username across hundreds of social networks.'],
    ['Maigret', 'https://github.com/soxoj/maigret', 'social', 'oss', 'Sherlock successor that parses found profiles and builds a report.'],
    ['Namechk', 'https://namechk.com', 'social', 'free', 'Username and domain availability across dozens of platforms.'],
    ['Instant Username Search', 'https://instantusername.com', 'social', 'free', 'Real-time username checks across 100+ sites as you type.'],
    ['Social Searcher', 'https://www.social-searcher.com', 'social', 'freemium', 'Keyword monitoring across public social media posts.'],
    ['TGStat', 'https://tgstat.com', 'social', 'freemium', 'Telegram channel and group catalogue with statistics and post search.'],
    ['Bluesky search', 'https://bsky.app/search', 'social', 'free', 'Native post search with from:, mentions:, since: and until: operators.'],
    ['Reddit search', 'https://www.reddit.com/search', 'social', 'free', 'Posts and comments; pair with site:reddit.com dorks for better recall.'],

    ['Have I Been Pwned', 'https://haveibeenpwned.com', 'email', 'free', 'Check whether an email address or domain appears in known data breaches.'],
    ['Hunter', 'https://hunter.io', 'email', 'freemium', 'Discover the email format an organisation uses, and verify addresses.'],
    ['Epieos', 'https://epieos.com', 'email', 'freemium', 'Reverse email lookup for linked Google and other service accounts.'],
    ['holehe', 'https://github.com/megadose/holehe', 'email', 'oss', 'CLI that checks which sites an email is registered on via sign-up flows.'],
    ['MX Toolbox', 'https://mxtoolbox.com', 'email', 'freemium', 'MX, SPF, DKIM, DMARC and blocklist checks for mail domains.'],
    ['Google Messageheader', 'https://toolbox.googleapps.com/apps/messageheader/', 'email', 'free', 'Paste raw headers to visualise relay hops and delays.'],

    ['crt.sh', 'https://crt.sh', 'domain', 'free', 'Certificate Transparency search — one of the best passive subdomain sources.'],
    ['DNSDumpster', 'https://dnsdumpster.com', 'domain', 'freemium', 'Passive DNS reconnaissance with a visual map of discovered hosts.'],
    ['SecurityTrails', 'https://securitytrails.com', 'domain', 'freemium', 'Historical DNS and WHOIS, subdomains and associated domains.'],
    ['ViewDNS.info', 'https://viewdns.info', 'domain', 'free', 'Reverse IP, reverse WHOIS, IP history and two dozen other lookups.'],
    ['ICANN Lookup', 'https://lookup.icann.org', 'domain', 'free', 'Official RDAP-based registration data for any gTLD domain.'],
    ['who.is', 'https://who.is', 'domain', 'free', 'WHOIS records, DNS and registrar details in one view.'],
    ['DomainTools Whois', 'https://whois.domaintools.com', 'domain', 'freemium', 'WHOIS lookups; paid tiers add ownership and hosting history.'],
    ['BuiltWith', 'https://builtwith.com', 'domain', 'freemium', 'Technology profiling: CMS, analytics IDs, frameworks and hosting.'],
    ['Subfinder', 'https://github.com/projectdiscovery/subfinder', 'domain', 'oss', 'Fast passive subdomain enumeration from dozens of sources.'],
    ['OWASP Amass', 'https://github.com/owasp-amass/amass', 'domain', 'oss', 'In-depth attack-surface mapping and external asset discovery.'],

    ['Shodan', 'https://www.shodan.io', 'infra', 'freemium', 'Search engine for internet-connected devices, open ports and banners.'],
    ['Censys', 'https://search.censys.io', 'infra', 'freemium', 'Host and certificate search across the public IPv4 space.'],
    ['GreyNoise', 'https://viz.greynoise.io', 'infra', 'freemium', 'Tells you whether an IP is mass-scanning the internet or is a known benign service.'],
    ['AbuseIPDB', 'https://www.abuseipdb.com', 'infra', 'freemium', 'Community-reported abusive IP addresses with confidence scores.'],
    ['IPinfo', 'https://ipinfo.io', 'infra', 'freemium', 'IP geolocation, ASN, company and VPN or hosting detection.'],
    ['HE BGP Toolkit', 'https://bgp.he.net', 'infra', 'free', 'ASN, prefix and peering data for routing research.'],
    ['RIPEstat', 'https://stat.ripe.net', 'infra', 'free', 'Routing history, registry data and geolocation for IPs and ASNs.'],
    ['FOFA', 'https://en.fofa.info', 'infra', 'freemium', 'Cyberspace search engine similar to Shodan, with strong Asia coverage.'],

    ['VirusTotal', 'https://www.virustotal.com', 'threat', 'freemium', 'Files, URLs, domains and IPs checked against dozens of engines, with a relations graph.'],
    ['urlscan.io', 'https://urlscan.io', 'threat', 'freemium', 'Loads a URL in a sandbox and records requests, DOM and screenshots. Submissions may be public.'],
    ['MalwareBazaar', 'https://bazaar.abuse.ch', 'threat', 'free', 'Malware sample sharing, searchable by hash, tag and signature.'],
    ['URLhaus', 'https://urlhaus.abuse.ch', 'threat', 'free', 'Database of URLs used to distribute malware.'],
    ['ThreatFox', 'https://threatfox.abuse.ch', 'threat', 'free', 'Community platform for sharing indicators of compromise.'],
    ['AlienVault OTX', 'https://otx.alienvault.com', 'threat', 'free', 'Open Threat Exchange with community "pulses" of related IOCs.'],
    ['Hybrid Analysis', 'https://www.hybrid-analysis.com', 'threat', 'freemium', 'Free malware sandbox with public reports.'],
    ['ANY.RUN', 'https://any.run', 'threat', 'freemium', 'Interactive malware sandbox you can click through in real time.'],

    ['Google Lens', 'https://lens.google.com', 'image', 'free', 'Reverse image search with object and text recognition.'],
    ['TinEye', 'https://tineye.com', 'image', 'free', 'Finds exact and edited copies of an image; sort by oldest to find the source.'],
    ['Yandex Images', 'https://yandex.com/images/', 'image', 'free', 'Reverse image search that excels at landmarks and places.'],
    ['Bing Visual Search', 'https://www.bing.com/visualsearch', 'image', 'free', "Microsoft's reverse image search, often finds different matches."],
    ['FotoForensics', 'https://fotoforensics.com', 'image', 'free', 'Error level analysis and metadata to spot manipulation.'],
    ['Forensically', 'https://29a.ch/photo-forensics/', 'image', 'free', 'In-browser clone detection, ELA, noise analysis and magnifier.'],
    ['InVID-WeVerify', 'https://www.invid-project.eu/tools-and-services/invid-verification-plugin/', 'image', 'free', 'Browser plugin for video keyframes, reverse search and verification.'],
    ["Jeffrey's Image Metadata Viewer", 'https://exif.regex.info/exif.cgi', 'image', 'free', 'Exhaustive EXIF, XMP and IPTC metadata viewer.'],

    ['Google Earth', 'https://earth.google.com/web/', 'geo', 'free', '3D imagery; the desktop app adds historical imagery for change detection.'],
    ['Copernicus Browser', 'https://browser.dataspace.copernicus.eu', 'geo', 'free', 'Free Sentinel satellite imagery, refreshed every few days.'],
    ['NASA Worldview', 'https://worldview.earthdata.nasa.gov', 'geo', 'free', 'Daily global satellite imagery with fire, smoke and weather layers.'],
    ['Overpass Turbo', 'https://overpass-turbo.eu', 'geo', 'free', 'Query OpenStreetMap for every feature matching a pattern.'],
    ['Bellingcat OSM Search', 'https://osm-search.bellingcat.com', 'geo', 'free', 'Find places by combinations of nearby OpenStreetMap features.'],
    ['SunCalc', 'https://www.suncalc.org', 'geo', 'free', 'Sun position and shadow direction for any place and time — for chronolocation.'],
    ['Mapillary', 'https://www.mapillary.com', 'geo', 'free', 'Crowdsourced street-level imagery, often where Street View is missing.'],
    ['PeakVisor', 'https://peakvisor.com', 'geo', 'freemium', '3D mountain panoramas to match ridgelines in a photo.'],
    ['Wikimapia', 'https://wikimapia.org', 'geo', 'free', 'Crowd-annotated map of buildings and places.'],

    ['Flightradar24', 'https://www.flightradar24.com', 'transport', 'freemium', 'Live and historical flight tracking with aircraft details.'],
    ['ADS-B Exchange', 'https://globe.adsbexchange.com', 'transport', 'free', 'Unfiltered ADS-B tracking, including many aircraft hidden elsewhere.'],
    ['MarineTraffic', 'https://www.marinetraffic.com', 'transport', 'freemium', 'AIS vessel tracking, port calls and ship particulars.'],
    ['VesselFinder', 'https://www.vesselfinder.com', 'transport', 'freemium', 'Free AIS ship tracking and vessel database.'],
    ['OpenRailwayMap', 'https://www.openrailwaymap.org', 'transport', 'free', 'Rail infrastructure, signalling and gauges from OpenStreetMap.'],

    ['Wayback Machine', 'https://web.archive.org', 'archive', 'free', 'Hundreds of billions of archived pages; capture new ones on demand.'],
    ['archive.today', 'https://archive.ph', 'archive', 'free', 'On-demand snapshots that handle many dynamic pages well.'],
    ['Common Crawl', 'https://commoncrawl.org', 'archive', 'free', 'Open, petabyte-scale web crawl data for bulk research.'],

    ['OpenCorporates', 'https://opencorporates.com', 'records', 'freemium', 'The largest open database of companies and officers worldwide.'],
    ['OCCRP Aleph', 'https://aleph.occrp.org', 'records', 'free', 'Investigative data platform across leaks, registries and court records.'],
    ['ICIJ Offshore Leaks', 'https://offshoreleaks.icij.org', 'records', 'free', 'Entities from the Panama, Paradise and Pandora Papers.'],
    ['OpenSanctions', 'https://www.opensanctions.org', 'records', 'free', 'Sanctions lists, politically exposed persons and watchlists in one place.'],
    ['SEC EDGAR', 'https://www.sec.gov/edgar/search/', 'records', 'free', 'Full-text search of US public company filings.'],
    ['UK Companies House', 'https://find-and-update.company-information.service.gov.uk', 'records', 'free', 'UK company officers, filings and persons with significant control.'],
    ['GLEIF LEI Search', 'https://search.gleif.org', 'records', 'free', 'Legal Entity Identifiers and corporate parent relationships.'],

    ['GitHub code search', 'https://github.com/search?type=code', 'code', 'free', 'Search public code for leaked configs, internal hostnames and emails.'],
    ['grep.app', 'https://grep.app', 'code', 'free', 'Fast regex search across half a million public Git repositories.'],
    ['PublicWWW', 'https://publicwww.com', 'code', 'freemium', 'Search website source code — find sites sharing an analytics or ad ID.'],

    ['OSINT Framework', 'https://osintframework.com', 'learn', 'free', 'The classic tree of OSINT resources by category.'],
    ['Bellingcat Toolkit', 'https://bellingcat.gitbook.io/toolkit', 'learn', 'free', "Bellingcat's maintained catalogue of investigation tools with how-tos."],
    ['Awesome OSINT', 'https://github.com/jivoi/awesome-osint', 'learn', 'oss', 'Large community-curated list of OSINT tools and resources.'],
    ['Berkeley Protocol', 'https://www.ohchr.org/en/publications/policy-and-methodological-publications/berkeley-protocol-digital-open-source', 'learn', 'free', 'UN guidance on digital open source investigations and evidence handling.'],
  ];
  const tools = T.map(([name, url, cat, acc, desc]) => ({ name, url, cat, access: acc, desc }));

  /* ---------- OPSEC checklist ---------- */
  const opsec = [
    ['profile', 'Use a dedicated research browser profile or VM, separate from personal accounts.'],
    ['logged', 'Assume every lookup is logged by the service you query.'],
    ['active', 'Know which actions are active: public scans and URL submissions can tip off the target.'],
    ['accounts', 'Stay logged out of personal social accounts — some platforms reveal who viewed a profile.'],
    ['archive', 'Archive pages before they change or vanish, and record the capture URL.'],
    ['hash', 'Hash and timestamp files you collect; keep originals untouched.'],
    ['sources', 'Log every source URL and access time as you go.'],
  ];

  /* ---------- dork presets ---------- */
  const dorkPresets = [
    { name: 'Documents on a site', needs: 'site', set: { filetype: 'pdf, doc, docx, xls, xlsx, ppt, pptx' } },
    { name: 'Subdomains', needs: 'site', fn: (f) => ({ site: f.site ? `*.${f.site.replace(/^\*\./, '')}` : '*.', nosite: f.site ? `www.${f.site.replace(/^\*\./, '')}` : '' }) },
    { name: 'Directory listings', needs: 'site', set: { intitle: 'index of', intext: 'parent directory' } },
    { name: 'Login pages', needs: 'site', set: { any: 'inurl:login inurl:signin inurl:admin' } },
    { name: 'Mentions off-site', needs: 'site', fn: (f) => ({ exact: f.site || '', nosite: f.site || '', site: '' }) },
    { name: 'Paste sites', fn: (f) => ({ site: '', any: 'site:pastebin.com site:ghostbin.site site:rentry.co', exact: f.exact || f.site || '' }) },
    { name: 'Cloud storage', fn: (f) => ({ site: '', any: 'site:s3.amazonaws.com site:blob.core.windows.net site:storage.googleapis.com', exact: f.exact || f.site || '' }) },
    { name: 'Spreadsheets & exports', needs: 'site', set: { filetype: 'csv, xls, xlsx' } },
  ];

  window.ATLAS_DATA = { types, pivots, categories, access, tools, opsec, dorkPresets };
})();
