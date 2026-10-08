# Stablecoini: objava javne web stranice

Cijela stranica (Atlas, Radar, Prinosi i Wallet checker) je jedna datoteka: `dist/stablecoini-web.js`. Objavljuješ je kao novi Cloudflare Worker, a onda je svatko može otvoriti bez prijave.

## 1. Blockscout ključ (besplatan)

1. Otvori https://dev.blockscout.com i registriraj se.
2. Napravi API ključ (besplatni plan: 100.000 poziva dnevno). Ključ počinje s `proapi_`.

Bez ključa stranica koristi javne Blockscout explorere, koji su sporiji i strože ograničeni.

## 2. Novi Worker

1. Na https://dash.cloudflare.com otvori **Workers & Pages** i klikni **Create**.
2. Odaberi **Create Worker** (Hello World), upiši ime `stablecoini` i klikni **Deploy**.
3. Klikni **Edit code**, obriši sav postojeći kod, zalijepi cijeli `dist/stablecoini-web.js` i klikni **Deploy**.
4. Otvori **Settings → Variables and Secrets** i dodaj dvije varijable tipa **Secret**:
   - `RPC_URL`: isti Helius URL kao u Workeru `solana-mints`
   - `BLOCKSCOUT_KEY`: ključ iz prvog koraka
5. Klikni **Deploy**.

Adresa stranice je `https://www.TVOJE-IME.workers.dev`. Tu poveznicu možeš poslati bilo kome.

## Ograničenja besplatnih planova

- **Helius** (Solana): besplatni plan ima ograničen broj kredita mjesečno. Radar za Solanu osvježava se najviše svake 3 minute, a Wallet checker za Solanu troši više kredita po provjeri. Ako stranica postane jako posjećena, treba plaćeni plan ili zaseban Helius ključ samo za stranicu.
- **Blockscout**: 100.000 poziva dnevno; radar troši oko 26 poziva u minuti dok ga netko gleda.
- **Cloudflare Workers**: 100.000 zahtjeva dnevno na besplatnom planu.

## Izmjene

Datoteke `pages/*.html` i `src/server.js` su izvor. Nakon izmjene se pokreće `python3 build.py`, koji ponovno napravi `dist/stablecoini-web.js`, a zatim se taj kod ponovno zalijepi u Worker.

## Engleska verzija

Engleske stranice su pod `/en`, `/en/radar`, `/en/yields` i `/en/wallet`, a na vrhu svake stranice je prekidač HR · EN. Izvor je u `pages/en/` (Atlas je razdijeljen u `pages/en/parts/atlas-1..3.html`). Kad se mijenja sadržaj, treba promijeniti i hrvatsku i englesku datoteku.
