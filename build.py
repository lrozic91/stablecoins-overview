#!/usr/bin/env python3
"""Sastavlja dist/stablecoini-web.js: HTML stranice + poslužiteljski kod u jednu datoteku za Cloudflare Worker.

Pokretanje: python3 build.py
Ulaz: pages/*.html (sadržaj stranica), src/server.js (rute i API),
      ../solana-konektor/worker.js (Solana i DefiLlama funkcije, kopiraju se doslovno).
"""
import json
import pathlib
import re
import sys

import theme

# python3 build.py --v1 sastavlja stari izgled (vodoravna traka); bez toga se koristi izgled iz theme.py.
V1 = "--v1" in sys.argv
ROOT = pathlib.Path(__file__).resolve().parent
PAGES = [
    ("/", "atlas.html", "Općenito", "Stablecoini na Ethereumu, Solani, Baseu, Arbitrumu i Robinhood Chainu: ponuda, povijest, peg, DeFi i regulativa."),
    ("/radar", "radar.html", "Radar", "Nova mintanja stablecoina uživo na pet mreža."),
    ("/prinosi", "prinosi.html", "Prinosi", "Vrste DeFi usluga za stablecoine i bazeni s najvišim prinosom."),
    ("/wallet", "wallet.html", "Wallet checker", "Stanje, povijest i DeFi pozicije stablecoina za EVM ili Solana wallet."),
]
# Engleska verzija: iste stranice pod /en, izvor u pages/en/ (Atlas je razdijeljen na dijelove u pages/en/parts/).
PAGES_EN = [
    ("/en", "atlas.html", "Overview", "Stablecoins on Ethereum, Solana, Base, Arbitrum and Robinhood Chain: supply, history, peg, DeFi and regulation."),
    ("/en/radar", "radar.html", "Radar", "New stablecoin mints live on five networks."),
    ("/en/yields", "yields.html", "Yields", "Types of DeFi services for stablecoins and the highest-yielding pools."),
    ("/en/wallet", "wallet.html", "Wallet checker", "Stablecoin balances, history and DeFi positions for an EVM or Solana wallet."),
]
# Par hrvatske i engleske adrese za prekidač HR/EN.
TWIN = {hr[0]: en[0] for hr, en in zip(PAGES, PAGES_EN)}
TWIN.update({v: k for k, v in list(TWIN.items())})

FAVICON = ("data:image/svg+xml," +
           "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%230f6e63'/%3E"
           "%3Ctext x='16' y='22' font-family='Arial' font-weight='700' font-size='18' text-anchor='middle' fill='white'%3E$%3C/text%3E%3C/svg%3E")

SITE_CSS = """
body { margin: 0; }
img { max-width: 100%; }
[hidden] { display: none !important; }
.site-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 18px; padding: 10px max(20px, calc((100% - 1040px) / 2 + 20px));
  background: var(--surface, #fff); border-bottom: 1px solid var(--line, #dbe2e1); font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif; font-size: 0.92rem; }
.site-bar a { color: var(--muted, #5b6b68); text-decoration: none; padding-block: 4px; }
.site-bar a:hover { color: var(--ink, #14211f); }
.site-bar a[aria-current="page"] { color: var(--ink, #14211f); font-weight: 600; box-shadow: inset 0 -2px 0 var(--accent, #0f6e63); }
.site-bar .brand { font-family: "Bricolage Grotesque", "Segoe UI", system-ui, sans-serif; font-weight: 700; color: var(--accent, #0f6e63); margin-right: 8px; font-size: 1rem; }
.site-bar .lang { margin-left: auto; font-size: 0.85rem; }
.site-bar .lang b { color: var(--ink, #14211f); }
.site-foot { padding: 24px max(20px, calc((100% - 1040px) / 2 + 20px)) 40px; color: var(--muted, #5b6b68); font-size: 0.82rem; font-family: "IBM Plex Sans", system-ui, sans-serif; border-top: 1px solid var(--line, #dbe2e1); }
"""


def site_bar(current, en=False):
    pages = PAGES_EN if en else PAGES
    links = [f'<a class="brand" href="{pages[0][0]}">{"Stablecoins" if en else "Stablecoini"}</a>']
    for path, _, label, _ in pages:
        cur = ' aria-current="page"' if path == current else ""
        links.append(f'<a href="{path}"{cur}>{label}</a>')
    twin = TWIN.get(current, "/" if en else "/en")
    if en:
        links.append(f'<span class="lang"><a href="{twin}" hreflang="hr" lang="hr">HR</a> · <b>EN</b></span>')
    else:
        links.append(f'<span class="lang"><b>HR</b> · <a href="{twin}" hreflang="en" lang="en">EN</a></span>')
    label = "Pages" if en else "Stranice"
    return f'<nav class="site-bar" aria-label="{label}">' + "".join(links) + "</nav>"


def wrap(path, body, desc, en=False):
    m = re.search(r"<title>(.*?)</title>", body, re.S)
    title = m.group(1).strip() if m else "Stablecoini"
    body = re.sub(r"<title>.*?</title>\s*", "", body, count=1, flags=re.S)
    # Linkovi na fontove idu u <head>, stil i sadržaj ostaju kako jesu.
    head_links = "".join(re.findall(r"<link [^>]*>\s*", body))
    body = re.sub(r"<link [^>]*>\s*", "", body)
    if not V1:
        pages = PAGES_EN if en else PAGES
        twin = TWIN.get(path, "/" if en else "/en")
        return (
            f"<!doctype html><html lang=\"{'en' if en else 'hr'}\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">"
            f"<title>{title}</title><meta name=\"description\" content=\"{desc}\">"
            f"<meta property=\"og:title\" content=\"{title}\"><meta property=\"og:description\" content=\"{desc}\">"
            f"<link rel=\"icon\" href=\"{FAVICON}\">{head_links}{theme.FONTS}</head><body>"
            + theme.shell(path, body, pages, twin, en) + "</body></html>"
        )
    return (
        f"<!doctype html><html lang=\"{'en' if en else 'hr'}\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">"
        f"<title>{title}</title><meta name=\"description\" content=\"{desc}\">"
        f"<meta property=\"og:title\" content=\"{title}\"><meta property=\"og:description\" content=\"{desc}\">"
        f"<link rel=\"icon\" href=\"{FAVICON}\">{head_links}<style>{SITE_CSS}</style></head><body>"
        + site_bar(path, en) + body +
        ("<footer class=\"site-foot\">Data: DefiLlama, CoinMarketCap, Blockscout and Helius. This site does not give financial advice.</footer>" if en else
         "<footer class=\"site-foot\">Podaci: DefiLlama, CoinMarketCap, Blockscout i Helius. Stranica ne daje financijske savjete.</footer>")
        + "</body></html>"
    )


def pages_js(pages):
    """Stranice kao nizovi kratkih redaka, da editor i kopiranje ne moraju raditi s redom od 200 KB."""
    out = ["const PAGES = {};"]
    for path, html in pages.items():
        parts = [html[i:i + 1500] for i in range(0, len(html), 1500)]
        out.append("PAGES[" + json.dumps(path) + "] = [")
        out += ["  " + json.dumps(p, ensure_ascii=False) + "," for p in parts]
        out.append('].join("");')
    return "\n".join(out) + "\n"


def main():
    pages = {}
    for path, fname, _, desc in PAGES:
        pages[path] = wrap(path, (ROOT / "pages" / fname).read_text(encoding="utf-8"), desc)
    for path, fname, _, desc in PAGES_EN:
        if fname == "atlas.html":
            src = "".join(f.read_text(encoding="utf-8") for f in sorted((ROOT / "pages" / "en" / "parts").glob("atlas-*.html")))
        else:
            src = (ROOT / "pages" / "en" / fname).read_text(encoding="utf-8")
        pages[path] = wrap(path, src, desc, en=True)
    pages["/404"] = wrap("/404", "<title>Stranica ne postoji</title><main style=\"max-width:640px;margin:0 auto;padding:48px 20px;font-family:system-ui\"><h1>Stranica ne postoji</h1><p><a href=\"/\">Natrag na početnu</a></p></main>", "Stranica ne postoji.")

    # U GitHub repozitoriju je solana-konektor unutar mape projekta, u project-files pokraj nje.
    konektor = ROOT / "solana-konektor" if (ROOT / "solana-konektor").exists() else ROOT.parent / "solana-konektor"
    lib = (konektor / "worker.js").read_text(encoding="utf-8")
    start = lib.index("const TOKENS = {")
    end = lib.index("function reply(id, result)")
    server = (ROOT / "src" / "server.js").read_text(encoding="utf-8")

    out = (
        "// Stablecoini: javna web stranica (Cloudflare Worker). Datoteku generira build.py; ne uređuj je ručno.\n"
        "// Tajne varijable: RPC_URL (Helius URL s api-key) i BLOCKSCOUT_KEY (besplatni ključ s dev.blockscout.com).\n\n"
        + lib[start:end]
        + "\n" + server
        + "\n" + pages_js(pages)
    )
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    (dist / "stablecoini-web.js").write_text(out, encoding="utf-8")
    # Ista datoteka kao .txt, jer aplikacija ne dopušta preuzimanje .js datoteka.
    (dist / ("stablecoini-web-v1.txt" if V1 else "stablecoini-web-v2.txt")).write_text(out, encoding="utf-8")
    print(f"dist/stablecoini-web.js: {len(out.encode('utf-8')) / 1024:.0f} KB, stranice: {', '.join(p for p in pages)}")


if __name__ == "__main__":
    main()
