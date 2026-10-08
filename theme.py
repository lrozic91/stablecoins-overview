"""Izgled v2 (od 2026-10-08): tamnozeleni bočni izbornik, gornja traka, bijele kartice i limeta gumbi.

build.py ga koristi po zadanom; `python3 build.py --v1` sastavlja stari izgled s vodoravnom trakom.
Stranice zadržavaju svoj CSS, a ovdje se samo pregaze njihove varijable boja i fontova te nekoliko elemenata.
"""

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">')

# Ikone u stilu linijskih ikona (24x24, obrub 1.8).
def _svg(d):
    return ('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>')

ICONS = {
    "overview": _svg('<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5Z"/><path d="M8 7h7M8 11h5"/>'),
    "radar": _svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18 6"/><circle cx="12" cy="12" r="1"/>'),
    "yields": _svg('<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>'),
    "wallet": _svg('<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Z"/><circle cx="16" cy="14.5" r="1.2"/>'),
    "shield": _svg('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z"/><path d="m9 12 2 2 4-4"/>'),
    "logo": ('<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
             '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M9 9.5c0-1 1-1.5 3-1.5s3 .6 3 1.5M15 14.5c0 1-1 1.5-3 1.5s-3-.6-3-1.5M9 9.5c0 2.5 6 2.5 6 5M12 6.5v11"/></svg>'),
}
NAV_ICONS = ["overview", "radar", "yields", "wallet"]

CSS = """
:root { --side-w: 228px; --side-bg: #17271f; --side-ink: #e8efe9; --side-muted: #93a79b; --side-act: #263b31; --lime: #c6f16b; --lime-ink: #13201a; }
html:root:not(#v2) {
  --bg: #f4f5f1; --surface: #ffffff; --ink: #121c17; --muted: #5a6d62; --line: #e2e6de;
  --accent: #2d5b45; --accent-soft: #edf5df; --hero-a: #ffffff; --hero-b: #ffffff; --hero-ink: #121c17;
  --f-display: "Inter", "Segoe UI", system-ui, sans-serif;
  --f-body: "Inter", "Segoe UI", system-ui, sans-serif;
  --f-data: "JetBrains Mono", ui-monospace, Menlo, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  html:root:not(#v2):not([data-theme="light"]) {
    --bg: #0d1411; --surface: #131d18; --ink: #e6ede8; --muted: #93a59b; --line: #24322b;
    --accent: #b6e46a; --accent-soft: #1d2b1c; --hero-a: #131d18; --hero-b: #131d18; --hero-ink: #e6ede8; color-scheme: dark;
  }
}
html:root:not(#v2)[data-theme="dark"] {
  --bg: #0d1411; --surface: #131d18; --ink: #e6ede8; --muted: #93a59b; --line: #24322b;
  --accent: #b6e46a; --accent-soft: #1d2b1c; --hero-a: #131d18; --hero-b: #131d18; --hero-ink: #e6ede8; color-scheme: dark;
}
html body { margin: 0; background: var(--bg); font-feature-settings: "cv11", "ss01"; -webkit-font-smoothing: antialiased; }
[hidden] { display: none !important; }
img { max-width: 100%; }

/* Bočni izbornik */
.sc-side { position: fixed; inset: 0 auto 0 0; width: var(--side-w); background: var(--side-bg); color: var(--side-ink); display: flex; flex-direction: column; padding: 18px 12px 14px; box-sizing: border-box; z-index: 20; font-family: "Inter", system-ui, sans-serif; }
.sc-side a { color: inherit; text-decoration: none; }
.sc-side svg { flex: none; width: 18px; height: 18px; max-width: none; }
.sc-side .sc-logo { white-space: nowrap; display: flex; align-items: center; gap: 6px; padding: 2px 6px 0; font-size: 0.95rem; letter-spacing: -0.02em; }
.sc-side .sc-logo svg { color: var(--lime); width: 22px; height: 22px; }
.sc-side .sc-logo b { font-weight: 800; }
.sc-side .sc-logo span { color: var(--side-muted); font-weight: 400; }
.sc-side .sc-label { margin: 34px 8px 10px; font-size: 0.66rem; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--side-muted); }
.sc-side nav { display: grid; gap: 4px; }
.sc-side nav a { display: flex; align-items: center; gap: 11px; padding: 10px 10px; border-radius: 6px; font-size: 0.88rem; color: #cfdbd3; }
.sc-side nav a:hover { background: rgba(255,255,255,0.05); color: #fff; }
.sc-side nav a[aria-current="page"] { background: var(--side-act); color: #fff; }
.sc-side nav a .sc-n { margin-left: auto; font: 500 0.66rem "JetBrains Mono", monospace; color: var(--side-muted); }
.sc-side nav a[aria-current="page"] svg { color: var(--lime); }
.sc-side .sc-trust { margin-top: auto; padding: 0 8px 16px; font-size: 0.82rem; line-height: 1.6; color: var(--side-muted); }
.sc-side .sc-trust svg { color: var(--lime); width: 20px; height: 20px; display: block; margin-bottom: 12px; }
.sc-side .sc-trust b { display: block; color: var(--side-ink); font-weight: 500; margin-bottom: 4px; }
.sc-side .sc-net { border-top: 1px solid rgba(255,255,255,0.1); padding: 14px 8px 0; display: flex; align-items: center; gap: 10px; font-size: 0.82rem; }
.sc-side .sc-net i { flex: none; width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.25); display: grid; place-items: center; font: 600 0.75rem "Inter", sans-serif; font-style: normal; }
.sc-side .sc-net small { display: block; color: var(--side-muted); font-size: 0.7rem; }

/* Gornja traka i sadržaj */
.sc-main { margin-left: var(--side-w); min-height: 100vh; display: flex; flex-direction: column; }
.sc-top { display: flex; align-items: center; gap: 12px; padding: 0 32px; height: 52px; background: var(--surface); border-bottom: 1px solid var(--line); font: 0.8rem "Inter", system-ui, sans-serif; color: var(--muted); }
.sc-top .sc-crumb b { color: var(--ink); font-weight: 500; }
.sc-top .sc-crumb i { font-style: normal; margin: 0 10px; opacity: 0.6; }
.sc-top .sc-ro { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; color: var(--accent); }
.sc-top .sc-ro svg { width: 14px; height: 14px; }
.sc-top .sc-lang { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.sc-top .sc-lang a, .sc-top .sc-lang b { padding: 4px 9px; font-size: 0.74rem; text-decoration: none; color: var(--muted); }
.sc-top .sc-lang b { background: var(--accent-soft); color: var(--ink); font-weight: 600; }
.sc-site-foot { margin-top: auto; padding: 22px 32px 30px; color: var(--muted); font: 0.78rem "Inter", system-ui, sans-serif; border-top: 1px solid var(--line); }

/* Prilagodbe elemenata stranica */
.sc-main h1 { font-weight: 700; letter-spacing: -0.03em; }
.sc-main h2, .sc-main h3 { font-weight: 650; letter-spacing: -0.015em; }
.sc-main .eyebrow { font-family: "Inter", system-ui, sans-serif; font-weight: 600; font-size: 0.68rem; letter-spacing: 0.18em; }
.sc-main header.hero { background: transparent; color: var(--ink); border-radius: 0; padding-inline: 0; }
.sc-main header.hero .lead, .sc-main header.hero .eyebrow { color: var(--muted); opacity: 1; }
.sc-main header.hero .fig, .sc-main .card, .sc-main .chart-card, .sc-main .net, .sc-main .type, .sc-main .panel, .sc-main table { border-radius: 10px; }
.sc-main .chart-card { background: var(--surface); }
.sc-main section > h2 { color: var(--ink); }
.sc-main header.hero .fig { background: var(--surface); border: 1px solid var(--line); }
.sc-main header.hero .fig b { color: var(--ink); }
.sc-main .seg { border-radius: 8px; }
.sc-main .seg button[aria-pressed="true"] { background: var(--accent-soft); color: var(--ink); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent); border-radius: 6px; }
.sc-main form.addr button, .sc-main .btn-primary { background: var(--lime); color: var(--lime-ink); border: 1px solid color-mix(in srgb, var(--lime) 70%, #000); border-radius: 8px; font-weight: 600; }
.sc-main form.addr button:hover { filter: brightness(0.97); }
.sc-main form.addr input { border-radius: 8px; background: var(--surface); }
.sc-main input:focus-visible, .sc-main select:focus-visible { outline: 2px solid color-mix(in srgb, var(--lime) 80%, #000); outline-offset: 1px; }
.sc-main nav.sections { top: 0; background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(6px); }
.sc-main nav.sections ul { max-width: 980px; }

@media (max-width: 900px) {
  .sc-side { position: sticky; top: 0; inset: auto; width: auto; flex-direction: row; align-items: center; gap: 12px; padding: 10px 14px; overflow-x: auto; }
  .sc-side .sc-label, .sc-side .sc-trust, .sc-side .sc-net, .sc-side nav a .sc-n { display: none; }
  .sc-side .sc-logo { flex: none; padding: 0; font-size: 1rem; }
  .sc-side nav { display: flex; gap: 2px; }
  .sc-side nav a { padding: 7px 10px; white-space: nowrap; font-size: 0.84rem; }
  .sc-side nav a svg { display: none; }
  .sc-main { margin-left: 0; }
  .sc-top { padding: 0 16px; height: 44px; }
  .sc-top .sc-ro span { display: none; }
  .sc-site-foot { padding-inline: 16px; }
  .sc-main nav.sections { top: 52px; }
}
"""


def shell(path, body, pages, twin, en):
    """Bočni izbornik + gornja traka oko sadržaja stranice."""
    links = []
    current_label = pages[0][2]
    for i, (p, _, label, _) in enumerate(pages):
        cur = ' aria-current="page"' if p == path else ""
        if p == path:
            current_label = label
        links.append(f'<a href="{p}"{cur}>{ICONS[NAV_ICONS[i]]}<span>{label}</span><span class="sc-n">0{i + 1}</span></a>')
    home = pages[0][0]
    t = (lambda hr, e: e if en else hr)
    side = (
        f'<aside class="sc-side" aria-label="{t("Izbornik", "Menu")}">'
        f'<a class="sc-logo" href="{home}">{ICONS["logo"]}<b>stablecoins</b><span>/ overview</span></a>'
        f'<div class="sc-label">{t("Pregled tržišta", "Market overview")}</div>'
        f'<nav>{"".join(links)}</nav>'
        f'<div class="sc-trust">{ICONS["shield"]}<b>{t("Samo javni podaci.", "Public data only.")}</b>'
        f'{t("Bez spajanja walleta.<br>Bez potpisa i transakcija.", "No wallet connection.<br>No signatures or transactions.")}</div>'
        f'<div class="sc-net"><i>5</i><div>{t("Pet mreža", "Five networks")}<small>ETH · SOL · Base · ARB · Robinhood</small></div></div>'
        '</aside>'
    )
    lang = (f'<span class="sc-lang"><a href="{twin}" hreflang="hr" lang="hr">HR</a><b>EN</b></span>' if en
            else f'<span class="sc-lang"><b>HR</b><a href="{twin}" hreflang="en" lang="en">EN</a></span>')
    top = (
        f'<div class="sc-top"><span class="sc-crumb">{t("Stablecoini", "Stablecoins")}<i>/</i><b>{current_label}</b></span>'
        f'<span class="sc-ro">{ICONS["shield"]}<span>{t("Samo čitanje", "Read-only")}</span></span>{lang}</div>'
    )
    foot = ('<footer class="sc-site-foot">' + t("Podaci: DefiLlama, CoinMarketCap, Blockscout i Helius. Stranica ne daje financijske savjete.",
                                            "Data: DefiLlama, CoinMarketCap, Blockscout and Helius. This site does not give financial advice.") + '</footer>')
    # Stil teme ide na kraj, iza stilova stranice, da ih pouzdano pregazi.
    return side + '<div class="sc-main">' + top + body + foot + '</div><style>' + CSS + '</style>'
