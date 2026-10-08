// Solana Mints: mali MCP server (Cloudflare Worker) za radar mintanja stablecoina.
// Alat get_stablecoin_mints vraća nedavna mintanja odabranih stablecoina na Solani,
// get_stablecoin_history povijest ponude stablecoina s DefiLlame (za Atlas),
// get_stablecoin_yields prinose (APY) DeFi bazena sa stablecoinima s DefiLlame (za stranicu Prinosi),
// a get_wallet_stablecoins stanje i povijest stablecoina jednog Solana walleta (za Wallet checker; treba Helius RPC_URL).
// Postavka (nije obavezna): varijabla RPC_URL, npr. https://mainnet.helius-rpc.com/?api-key=TVOJ_KLJUC
// Bez nje koristi se javni https://api.mainnet-beta.solana.com, koji je spor i strogo ograničen.

const TOKENS = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD",
  "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH": "USDG",
  USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB: "USD1",
  HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr: "EURC",
};

const TOOL = {
  name: "get_stablecoin_mints",
  description:
    "Recent mints (mintTo / mintToChecked) of major stablecoins on Solana: USDC, USDT, PYUSD, USDG, USD1, EURC. " +
    "Returns the current slot and a list of mints newer than since_slot.",
  inputSchema: {
    type: "object",
    properties: {
      since_slot: { type: "integer", description: "Only return mints in slots greater than this. Omit for the latest ones." },
      limit_per_token: { type: "integer", description: "How many recent mint-authority transactions to scan per token (1-25, default 10)." },
    },
  },
};

const HIST_TOOL = {
  name: "get_stablecoin_history",
  description:
    "Stablecoin supply history from DefiLlama. With `top`: list the current top N stablecoins by circulating supply (id, name, symbol, circulating USD). " +
    "With `id`: monthly total circulating supply in USD across all chains (first day of each month, plus the latest point).",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "DefiLlama stablecoin id, e.g. \"1\" for USDT." },
      top: { type: "integer", description: "Return the current top N stablecoins (1-30)." },
    },
  },
};
const YIELD_TOOL = {
  name: "get_stablecoin_yields",
  description:
    "Stablecoin yield pools from DefiLlama (lending, savings, vaults, liquidity pools), sorted by APY, highest first. " +
    "Each row: [chain, project, symbol, tvlUsd, apy, apyBase, apyReward, apyMean30d, exposure, poolMeta, pool id].",
  inputSchema: {
    type: "object",
    properties: {
      min_tvl: { type: "number", description: "Minimum TVL in USD (default 100000)." },
      limit: { type: "integer", description: "Maximum rows (1-2000, default 1000)." },
    },
  },
};
const WALLET_TOOL = {
  name: "get_wallet_stablecoins",
  description:
    "Solana wallet check: all fungible tokens the wallet holds (with symbol, name, balance, USD price when known), liquidity-position NFTs, " +
    "and the wallet's recent stablecoin transfers (USDC, USDT, PYUSD, USDG, USD1, EURC, USDS) for a balance history. Needs a Helius RPC_URL.",
  inputSchema: {
    type: "object",
    properties: {
      address: { type: "string", description: "Solana wallet address (base58)." },
      pages: { type: "integer", description: "History pages of 100 transactions to scan (1-20, default 5)." },
    },
    required: ["address"],
  },
};
const TOOLS = [TOOL, HIST_TOOL, YIELD_TOOL, WALLET_TOOL];

// Stablecoini čije promjene pratimo u povijesti walleta (uz TOKENS gore).
const WALLET_STABLES = Object.assign({}, TOKENS, { USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA: "USDS" });

async function heliusPost(env, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(env.RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 429 && attempt < 2) { await sleep(1200); continue; }
    if (!r.ok) throw new Error("Helius HTTP " + r.status + " on " + body.method + ": " + (await r.text()).slice(0, 200));
    const j = await r.json();
    if (j.error) throw new Error("Helius " + body.method + ": " + (j.error.message || JSON.stringify(j.error)));
    return j.result;
  }
}

async function getWallet(env, args) {
  const addr = String(args.address || "").trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) throw new Error("Not a valid Solana address.");
  if (!env.RPC_URL || !/helius/i.test(env.RPC_URL)) throw new Error("Wallet check needs a Helius RPC_URL on the worker.");
  const key = new URL(env.RPC_URL).searchParams.get("api-key");
  const pages = Math.max(1, Math.min(20, Number(args.pages || 5)));

  // 1) Što wallet drži: zamjenjivi tokeni (searchAssets, tokenType fungible) sa simbolima i cijenama kad ih Helius zna.
  // NFT-ovi se traže posebno i samo jedna stranica, jer neki walleti imaju tisuće spam NFT-ova.
  const tokens = [], positions = [];
  let solUsd = null;
  const search = async (tokenType, page, limit, native) => {
    try {
      return await heliusPost(env, { jsonrpc: "2.0", id: 1, method: "searchAssets", params: {
        ownerAddress: addr, tokenType, page, limit, options: { showNativeBalance: native, showZeroBalance: false },
      } });
    } catch (e) {
      if (/too big/i.test(String(e.message)) && limit > 50) return search(tokenType, page, Math.floor(limit / 4), native);
      throw e;
    }
  };
  for (let page = 1; page <= 4; page++) {
    const res = await search("fungible", page, 500, page === 1);
    if (page === 1 && res.nativeBalance) solUsd = { sol: (res.nativeBalance.lamports || 0) / 1e9, usd: res.nativeBalance.total_price || null };
    for (const a of res.items || []) {
      const md = (a.content && a.content.metadata) || {};
      const ti = a.token_info;
      if (!ti) continue;
      const bal = Number(ti.balance || 0) / Math.pow(10, ti.decimals || 0);
      if (bal > 0) tokens.push([a.id, ti.symbol || md.symbol || "", md.name || "", bal, ti.price_info ? ti.price_info.price_per_token : null]);
    }
    if (!res.items || res.items.length < (res.limit || 500)) break;
    await sleep(150);
  }
  try {
    const res = await search("nonFungible", 1, 1000, false);
    for (const a of res.items || []) {
      const md = (a.content && a.content.metadata) || {};
      const name = md.name || "";
      if (/position|whirlpool|liquidity|clmm|dlmm|raydium|orca|meteora|kamino/i.test(name)) positions.push([a.id, name, md.symbol || ""]);
    }
  } catch (e) { /* pozicije su dodatak; bez njih vraćamo ostalo */ }

  // 2) Povijest prijenosa stablecoina (Helius Enhanced Transactions API, 100 transakcija po stranici).
  const events = [];
  let before = "", scanned = 0, complete = false;
  for (let i = 0; i < pages; i++) {
    const url = "https://api.helius.xyz/v0/addresses/" + addr + "/transactions?api-key=" + encodeURIComponent(key) + "&limit=100" + (before ? "&before=" + before : "");
    let r;
    for (let attempt = 0; ; attempt++) {
      r = await fetch(url);
      if (r.status === 429 && attempt < 2) { await sleep(1500); continue; }
      break;
    }
    if (!r.ok) {
      if (i === 0) throw new Error("Helius history HTTP " + r.status + ": " + (await r.text()).slice(0, 200));
      break;
    }
    const txs = await r.json();
    if (!Array.isArray(txs) || !txs.length) { complete = true; break; }
    for (const tx of txs) {
      scanned++;
      const delta = {};
      for (const t of tx.tokenTransfers || []) {
        const sym = WALLET_STABLES[t.mint];
        if (!sym) continue;
        const amt = Number(t.tokenAmount) || 0;
        if (t.toUserAccount === addr) delta[sym] = (delta[sym] || 0) + amt;
        if (t.fromUserAccount === addr) delta[sym] = (delta[sym] || 0) - amt;
      }
      for (const sym in delta) if (delta[sym]) events.push([tx.timestamp, sym, Math.round(delta[sym] * 1e6) / 1e6, tx.signature, tx.type || "", tx.source || ""]);
    }
    before = txs[txs.length - 1].signature;
    if (txs.length < 100) { complete = true; break; }
    await sleep(300);
  }
  return { address: addr, sol: solUsd, tokens, positions, events, scanned, complete };
}

// Popis bazena je velik (desetak MB), pa ne parsiramo cijeli JSON: tražimo samo objekte sa "stablecoin":true
// i parsiramo njih pojedinačno. Rezultat se drži 10 minuta u Cloudflare cacheu da ne trošimo CPU na svaki poziv.
const YIELDS_TTL = 600;
async function getYields(args, ctx) {
  const minTvl = Math.max(0, Number(args.min_tvl ?? 100000));
  const limit = Math.max(1, Math.min(2000, Number(args.limit || 1000)));
  const cacheKey = new Request("https://cache.solana-mints/yields?min=" + minTvl + "&limit=" + limit);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return await hit.json();
  }
  const r = await fetch("https://yields.llama.fi/pools");
  if (!r.ok) throw new Error("DefiLlama yields HTTP " + r.status);
  const t = await r.text();
  const rows = [];
  const MARK = '"stablecoin":true';
  let pos = 0;
  for (;;) {
    const k = t.indexOf(MARK, pos);
    if (k < 0) break;
    const start = t.lastIndexOf('{"chain"', k);
    let end = t.indexOf('{"chain"', k);
    if (end < 0) end = t.lastIndexOf("]");
    pos = k + MARK.length;
    if (start < 0) continue;
    const slice = t.slice(start, end).replace(/[\s,\]]+$/, "");
    let o;
    try { o = JSON.parse(slice); } catch { continue; }
    const tvl = Number(o.tvlUsd) || 0;
    const apy = Number(o.apy);
    if (tvl < minTvl || !isFinite(apy) || apy <= 0) continue;
    const n = (v) => (v === null || v === undefined || !isFinite(Number(v)) ? null : Math.round(Number(v) * 1000) / 1000);
    rows.push([o.chain, o.project, o.symbol, Math.round(tvl), n(apy), n(o.apyBase), n(o.apyReward), n(o.apyMean30d), o.exposure || null, o.poolMeta || null, o.pool]);
  }
  rows.sort((a, b) => b[4] - a[4]);
  const data = { updated: new Date().toISOString(), min_tvl: minTvl, total: rows.length, rows: rows.slice(0, limit) };
  if (cache) {
    const put = cache.put(cacheKey, new Response(JSON.stringify(data), { headers: { "cache-control": "max-age=" + YIELDS_TTL, "content-type": "application/json" } }));
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  }
  return data;
}
const LLAMA = "https://stablecoins.llama.fi";

async function getTop(n) {
  const r = await fetch(LLAMA + "/stablecoins");
  if (!r.ok) throw new Error("DefiLlama HTTP " + r.status);
  const j = await r.json();
  const sum = (o) => Object.values(o || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  return j.peggedAssets
    .map((a) => ({ id: String(a.id), name: a.name, symbol: a.symbol, pegType: a.pegType, circulating: Math.round(sum(a.circulating)) }))
    .sort((a, b) => b.circulating - a.circulating)
    .slice(0, Math.max(1, Math.min(30, n)));
}

// Čita odgovor kao tekst i bez JSON.parse vadi prvu točku svakog mjeseca (štedi CPU na velikim nizovima).
async function getHistory(id) {
  const r = await fetch(LLAMA + "/stablecoincharts/all?stablecoin=" + encodeURIComponent(id));
  if (!r.ok) throw new Error("DefiLlama HTTP " + r.status);
  const t = await r.text();
  /** @type {Array<[string, number]>} */
  const points = [];
  /** @type {{ d: string, at: number } | null} */
  let last = null;
  let pos = 0, lastMonth = "";
  const valueAt = (from) => {
    const k = t.indexOf('"totalCirculatingUSD":{', from);
    if (k < 0) return null;
    const end = t.indexOf("}", k);
    const nums = t.slice(k + 23, end).match(/-?\d+(\.\d+)?(e[+-]?\d+)?/gi) || [];
    let sum = 0;
    for (const v of nums) sum += Number(v);
    return Math.round(sum);
  };
  for (;;) {
    const k = t.indexOf('"date":', pos);
    if (k < 0) break;
    let i = k + 7;
    if (t[i] === '"') i++;
    let j = i;
    while (j < t.length && t[j] >= "0" && t[j] <= "9") j++;
    const ts = Number(t.slice(i, j));
    pos = j;
    const d = new Date(ts * 1000).toISOString().slice(0, 10);
    const m = d.slice(0, 7);
    if (m !== lastMonth) {
      const v = valueAt(j);
      if (v !== null) points.push([d, v]);
      lastMonth = m;
    }
    last = { d, at: j };
  }
  if (last && (!points.length || points[points.length - 1][0] !== last.d)) {
    const v = valueAt(last.at);
    if (v !== null) points.push([last.d, v]);
  }
  return { id, points };
}

// Mint authority i decimale rijetko se mijenjaju, pa ih pamtimo dok Worker živi.
let META = null;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Šalje upite jedan po jedan s malim razmakom (besplatni Helius plan: oko 10 upita u sekundi, bez batcha).
// Vraća niz odgovora u istom obliku kao JSON-RPC batch: [{ id, result }].
// Cloudflare free plan dopušta 50 fetch poziva po zahtjevu; ostavljamo malu rezervu.
const BUDGET = 46;

async function rpc(env, body, budget) {
  const url = env.RPC_URL || "https://api.mainnet-beta.solana.com";
  const one = async (req) => {
    for (let attempt = 0; ; attempt++) {
      if (budget.used >= BUDGET) return { id: req.id, skipped: true };
      budget.used++;
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
      if (r.status === 429 && attempt < 1) { await sleep(1200); continue; }
      if (!r.ok) {
        const t = (await r.text()).slice(0, 200);
        throw new Error("Solana RPC HTTP " + r.status + " on " + req.method + (env.RPC_URL ? " (RPC_URL)" : " (public RPC, RPC_URL not set)") + ": " + t);
      }
      const j = await r.json();
      return { id: req.id, result: j.result, error: j.error };
    }
  };
  const out = [];
  for (const req of body) { out.push(await one(req)); await sleep(150); }
  return out;
}

async function loadMeta(env, budget) {
  if (META) return META;
  const mints = Object.keys(TOKENS);
  const res = await rpc(env, mints.map((m, i) => ({ jsonrpc: "2.0", id: i, method: "getAccountInfo", params: [m, { encoding: "jsonParsed" }] })), budget);
  const out = {};
  for (const x of res) {
    const m = mints[x.id];
    const info = x.result && x.result.value && x.result.value.data && x.result.value.data.parsed && x.result.value.data.parsed.info;
    if (info && info.mintAuthority) out[m] = { authority: info.mintAuthority, decimals: info.decimals };
  }
  if (Object.keys(out).length) META = out;
  else throw new Error("Could not read stablecoin mint accounts from Solana RPC.");
  return out;
}

async function getMints(env, args) {
  const since = Number(args.since_slot || 0);
  const lim = Math.max(1, Math.min(25, Number(args.limit_per_token || 10)));
  const budget = { used: 0 };
  const meta = await loadMeta(env, budget);
  const mints = Object.keys(meta);

  // Jedan batch: trenutni slot + potpisi po mint authorityju.
  const batch = [
    { jsonrpc: "2.0", id: "slot", method: "getSlot", params: [{ commitment: "confirmed" }] },
    ...mints.map((m, i) => ({ jsonrpc: "2.0", id: i, method: "getSignaturesForAddress", params: [meta[m].authority, { limit: lim, commitment: "confirmed" }] })),
  ];
  const res = await rpc(env, batch, budget);
  let slot = 0;
  const sigs = new Map();
  for (const x of res) {
    if (x.id === "slot") { slot = x.result || 0; continue; }
    if (x.skipped) throw new Error("Request budget exhausted before reading signatures; try again.");
    for (const s of x.result || []) if (!s.err && s.slot > since) sigs.set(s.signature, s);
  }

  // Najstarije prvo, da kod djelomične obrade nastavak (slot) ne preskoči ništa.
  const list = [...sigs.values()].sort((a, b) => a.slot - b.slot).map((s) => s.signature);
  const mintsOut = [];
  if (list.length) {
    const txs = await rpc(env, list.map((sig, i) => ({ jsonrpc: "2.0", id: i, method: "getTransaction", params: [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }] })), budget);
    const skipped = txs.filter((x) => x.skipped).map((x) => sigs.get(list[x.id]).slot);
    if (skipped.length) slot = Math.min(...skipped) - 1;
    for (const x of txs) {
      const tx = x.result;
      if (!tx || !tx.meta || tx.meta.err) continue;
      const sig = list[x.id];
      const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
      const owners = {};
      for (const b of tx.meta.postTokenBalances || []) owners[keys[b.accountIndex]] = b.owner;
      const ins = [...tx.transaction.message.instructions];
      for (const g of tx.meta.innerInstructions || []) ins.push(...g.instructions);
      ins.forEach((ix, n) => {
        const p = ix.parsed;
        if (!p || (p.type !== "mintTo" && p.type !== "mintToChecked")) return;
        const m = p.info.mint;
        if (!meta[m]) return;
        const amount = p.info.tokenAmount ? Number(p.info.tokenAmount.uiAmountString) : Number(p.info.amount) / Math.pow(10, meta[m].decimals);
        mintsOut.push({
          symbol: TOKENS[m], mint: m, amount, to: owners[p.info.account] || p.info.account,
          signature: sig, index: n, slot: tx.slot, time: tx.blockTime || null,
        });
      });
    }
  }
  mintsOut.sort((a, b) => b.slot - a.slot);
  return { slot, mints: mintsOut };
}

function reply(id, result) { return Response.json({ jsonrpc: "2.0", id, result }); }
function fail(id, code, message) { return Response.json({ jsonrpc: "2.0", id, error: { code, message } }); }

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") return new Response("Solana Mints MCP server. Use POST (MCP Streamable HTTP).", { status: 405 });
    if (request.method !== "POST") return new Response(null, { status: 405 });
    let msg;
    try { msg = await request.json(); } catch { return fail(null, -32700, "Parse error"); }
    if (Array.isArray(msg)) return fail(null, -32600, "Batch not supported");
    const { id, method, params } = msg;
    if (id === undefined || id === null) return new Response(null, { status: 202 }); // notifikacije

    if (method === "initialize") {
      return reply(id, {
        protocolVersion: (params && params.protocolVersion) || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "solana-mints", version: "1.0.0" },
      });
    }
    if (method === "ping") return reply(id, {});
    if (method === "tools/list") return reply(id, { tools: TOOLS });
    if (method === "tools/call") {
      const name = params && params.name;
      if (!TOOLS.some((x) => x.name === name)) return fail(id, -32602, "Unknown tool");
      try {
        const a = params.arguments || {};
        // history_id / history_top na get_stablecoin_mints: rezervni put dok klijent ne osvježi popis alata.
        // yields na get_stablecoin_mints: rezervni put dok klijent ne osvježi popis alata.
        const data = name === WALLET_TOOL.name || (name === TOOL.name && a.wallet) ? await getWallet(env, { address: a.address || a.wallet, pages: a.pages })
          : name === YIELD_TOOL.name || (name === TOOL.name && a.yields) ? await getYields(a, ctx)
          : name === TOOL.name && a.history_id ? await getHistory(String(a.history_id))
          : name === TOOL.name && a.history_top ? { top: await getTop(Number(a.history_top)) }
          : name === TOOL.name ? await getMints(env, a)
          : a.id ? await getHistory(String(a.id)) : { top: await getTop(Number(a.top || 10)) };
        return reply(id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data });
      } catch (e) {
        return reply(id, { isError: true, content: [{ type: "text", text: String(e && e.message || e) }] });
      }
    }
    return fail(id, -32601, "Method not found");
  },
};
