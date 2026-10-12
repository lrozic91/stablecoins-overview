// ---- Web stranica: rute ----
// GET /, /radar, /prinosi, /wallet  -> HTML stranice
// GET /api/...                       -> podaci (JSON), dohvaćeni na poslužitelju
// Tajne varijable Workera: RPC_URL (Helius, za Solanu) i BLOCKSCOUT_KEY (za EVM mreže; bez njega koriste se javni Blockscout exploreri).

const BS_INSTANCES = {
  "1": "https://eth.blockscout.com",
  "8453": "https://base.blockscout.com",
  "42161": "https://arbitrum.blockscout.com",
  "4663": "https://robinhoodchain.blockscout.com",
};

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ISSUE = "0xcb8241adb0c3fdb35b70c24ce35c5eb0c17af7431c99f827d44a445ca624176a";
const ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

const RADAR_CHAINS = [
  { key: "eth", id: "1", rpcs: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://eth.llamarpc.com", "https://1rpc.io/eth", "https://cloudflare-eth.com"], blockTime: 12, chunk: 2000, issue: "0xdac17f958d2ee523a2206206994597c13d831ec7", tokens: {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": ["USDC", 6], "0xdc035d45d973e3ec169d2276ddab16f1e407384f": ["USDS", 18],
    "0x6b175474e89094c44da98b954eedeac495271d0f": ["DAI", 18], "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": ["USDe", 18],
    "0x6c3ea9036406852006290770bedfcaba0e23a0e8": ["PYUSD", 6], "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": ["USD1", 18],
    "0x8292bb45bf1ee4d140127049757c2e0ff06317ed": ["RLUSD", 18], "0xe343167631d89b6ffc58b88d6b7fb0228795491d": ["USDG", 6],
    "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c": ["EURC", 6], "0xdac17f958d2ee523a2206206994597c13d831ec7": ["USDT", 6] } },
  { key: "base", id: "8453", rpcs: ["https://mainnet.base.org", "https://base-rpc.publicnode.com", "https://base.drpc.org", "https://1rpc.io/base"], blockTime: 2, chunk: 450, tokens: {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": ["USDC", 6], "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": ["EURC", 6],
    "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": ["USDe", 18] } },
  { key: "arb", id: "42161", rpcs: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com", "https://arbitrum.drpc.org", "https://1rpc.io/arb"], blockTime: 0.25, chunk: 10000, budget: 10, tokens: {
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": ["USDC", 6], "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": ["USD₮0", 6],
    "0x46850ad61c2b7d64d08c9c754f45254596696984": ["PYUSD", 6], "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": ["USDe", 18] } },
  { key: "hood", id: "4663", rpcs: ["https://rpc.mainnet.chain.robinhood.com", "https://robinhood-rpc.publicnode.com", "https://robinhood.drpc.org", "https://rpc.arrowrpc.com"], chunk: 5000, budget: 14, tokens: {
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168": ["USDG", 6], "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": ["USDe", 18],
    "0xce24439f2d9c6a2289f741120fe202248b666666": ["U", 18] } },
];
const RADAR_WINDOW_S = 2100; // 35 min: malo više od razmaka automatskih provjera (30 min), da se ništa ne propusti

// Blockscout, sučelje kompatibilno s Etherscanom. Vraća polje result ili baca grešku.
// S ključem prvo pita PRO API; ako on za neku mrežu ne uspije, pokuša javni explorer te mreže.
async function blockscout(env, chainid, params) {
  if (env.BLOCKSCOUT_KEY) {
    const q = new URLSearchParams(params);
    q.set("chainid", chainid); q.set("apikey", env.BLOCKSCOUT_KEY);
    try { return await blockscoutGet("https://api.blockscout.com/v2/api?" + q); }
    catch (e) {
      if (!BS_INSTANCES[chainid]) throw e;
      try { return await blockscoutGet(BS_INSTANCES[chainid] + "/api?" + new URLSearchParams(params)); }
      catch (e2) { throw new Error("PRO: " + String(e.message || e).slice(0, 120) + " | " + String(e2.message || e2).slice(0, 80)); }
    }
  }
  if (!BS_INSTANCES[chainid]) throw new Error("Unsupported chain " + chainid);
  return blockscoutGet(BS_INSTANCES[chainid] + "/api?" + new URLSearchParams(params));
}

// Javni RPC čvorovi: mintanja se čitaju izravno iz čvora, bez Blockscouta (koji Workere često ograniči ili blokira).
async function rpcCall(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000) });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { throw new Error("RPC HTTP " + r.status + ": " + t.slice(0, 160)); }
  if (j.error) throw new Error("RPC: " + (j.error.message || JSON.stringify(j.error)).slice(0, 160));
  if (j.result === undefined || j.result === null) throw new Error("RPC HTTP " + r.status + ": " + t.slice(0, 160));
  return j.result;
}

// Isti poziv redom na svaki čvor s popisa, dok jedan ne uspije. Grešku zbog prevelikog raspona blokova vraća odmah.
const RANGE_ERR = /range|too many|exceed|query returned more|block.*limit|limit.*block/i;
// Čvorovi se pitaju počevši od nasumičnog, da se opterećenje rasporedi; nakon kruga bez uspjeha kratka pauza i još jedan krug.
async function rpcAny(c, method, params, budget) {
  let last;
  const k = Math.floor(Math.random() * c.rpcs.length);
  const order = [...c.rpcs.slice(k), ...c.rpcs.slice(0, k)];
  for (let round = 0; round < 2; round++) for (const [i, url] of order.entries()) {
    if (round && !i) await sleep(900);
    if (budget.used >= budget.max) throw new Error("Previše upita u jednoj provjeri" + (budget.last ? " (zadnja greška: " + budget.last + ")" : ""));
    budget.used++;
    try { return await rpcCall(url, method, params); }
    catch (e) {
      last = e; budget.last = String(e.message || e).slice(0, 120);
      if (method === "eth_getLogs" && RANGE_ERR.test(String(e.message)) && !/rate/i.test(String(e.message))) throw e;
    }
  }
  throw last;
}

// Logovi za raspon; ako čvor javi da je raspon prevelik, raspon se dijeli na pola.
async function getLogsSplit(c, filter, from, to, budget, out) {
  try {
    const res = await rpcAny(c, "eth_getLogs", [{ ...filter, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }], budget);
    if (!Array.isArray(res)) throw new Error("RPC: neočekivan odgovor");
    out.push(...res);
  } catch (e) {
    if (to - from < 50 || !RANGE_ERR.test(String(e.message))) throw e;
    const mid = Math.floor((from + to) / 2);
    await getLogsSplit(c, filter, from, mid, budget, out);
    await getLogsSplit(c, filter, mid + 1, to, budget, out);
  }
}

async function blockInfo(c, n, budget) {
  const b = await rpcAny(c, "eth_getBlockByNumber", [typeof n === "number" ? "0x" + n.toString(16) : n, false], budget);
  return { n: parseInt(b.number, 16), t: parseInt(b.timestamp, 16) };
}

async function radarChainRpc(c) {
  const budget = { used: 0, max: c.budget || 12 };
  const head = await blockInfo(c, "latest", budget);
  // Vrijeme bloka: poznato za veće mreže; za ostale procjena iz zadnjih 100 blokova (stariji blokovi traže arhivski čvor).
  let bt = c.blockTime;
  if (!bt) { const probe = await blockInfo(c, Math.max(0, head.n - 100), budget); bt = Math.max(0.05, (head.t - probe.t) / Math.max(1, head.n - probe.n)); }
  const start = { n: Math.max(0, head.n - Math.ceil(RADAR_WINDOW_S / bt)) };
  start.t = head.t - (head.n - start.n) * bt;
  // Vrijeme bloka procijenjeno između prvog i zadnjeg bloka prozora, da ne treba poziv po bloku.
  const tsOf = (b) => start.t + (b - start.n) * (head.t - start.t) / Math.max(1, head.n - start.n);
  const filters = [{ address: Object.keys(c.tokens), topics: [TRANSFER, ZERO32], issue: false }];
  if (c.issue) filters.push({ address: c.issue, topics: [ISSUE], issue: true });
  const mints = [];
  for (const f of filters) {
    const logs = [];
    for (let from = start.n; from <= head.n; from += c.chunk) {
      await getLogsSplit(c, { address: f.address, topics: f.topics }, from, Math.min(head.n, from + c.chunk - 1), budget, logs);
    }
    for (const lg of logs) {
      const tok = f.issue ? ["USDT", 6] : c.tokens[String(lg.address).toLowerCase()];
      if (!tok) continue;
      let raw;
      try { raw = BigInt(lg.data && lg.data !== "0x" ? lg.data.slice(0, 66) : "0x0"); } catch { continue; }
      const amt = Number(raw) / Math.pow(10, tok[1]);
      if (!(amt > 0)) continue;
      const b = parseInt(lg.blockNumber, 16);
      const to = !f.issue && lg.topics && lg.topics[2] ? "0x" + lg.topics[2].slice(26) : "";
      mints.push({ id: c.key + ":" + lg.transactionHash + ":" + parseInt(lg.logIndex, 16), sym: tok[0], amt, to, tx: lg.transactionHash, ts: Math.round(tsOf(b)), blk: b });
    }
  }
  return { ok: true, block: head.n, mints, warnings: [] };
}

async function blockscoutGet(url) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "stablecoini-web/1.0" } });
    if (r.status === 429 && attempt < 2) { await sleep(1200); continue; }
    const t = await r.text();
    let j;
    try { j = JSON.parse(t); } catch { throw new Error("Blockscout HTTP " + r.status + ": " + t.slice(0, 160)); }
    if (Array.isArray(j.result)) return j.result;
    if (/no (records|transactions|logs|token transfers)/i.test((j.message || "") + " " + (typeof j.result === "string" ? j.result : ""))) return [];
    if (j.result !== undefined && j.result !== null && j.status === "1") return j.result;
    if (/rate limit/i.test(t) && attempt < 2) { await sleep(1500); continue; }
    throw new Error("Blockscout HTTP " + r.status + ": " + t.slice(0, 200));
  }
}

const hexOrDec = (v) => (typeof v === "string" && v.startsWith("0x") ? parseInt(v, 16) : Number(v));

async function radarChain(env, c) {
  const since = Math.floor(Date.now() / 1000) - RADAR_WINDOW_S;
  const blk = await blockscout(env, c.id, { module: "block", action: "getblocknobytime", timestamp: String(since), closest: "after" });
  const fromBlock = String(typeof blk === "object" && blk ? blk.blockNumber : blk);
  const jobs = Object.keys(c.tokens).map((a) => ({ address: a, topic0: TRANSFER, topic1: ZERO32, topic0_1_opr: "and", tok: c.tokens[a], issue: false }));
  if (c.issue) jobs.push({ address: c.issue, topic0: ISSUE, topic1: "", topic0_1_opr: "", tok: ["USDT", 6], issue: true });
  const mints = [], failed = [];
  let latest = Number(fromBlock) || 0;
  for (const j of jobs) {
    const p = { module: "logs", action: "getLogs", fromBlock, toBlock: "latest", address: j.address, topic0: j.topic0 };
    if (j.topic1) { p.topic1 = j.topic1; p.topic0_1_opr = j.topic0_1_opr; }
    let rows;
    try { rows = await blockscout(env, c.id, p); }
    catch (e) { failed.push(j.tok[0] + ": " + String(e.message || e).slice(0, 120)); continue; }
    for (const lg of rows) {
      const b = hexOrDec(lg.blockNumber);
      if (b > latest) latest = b;
      let raw;
      try { raw = BigInt(lg.data && lg.data !== "0x" ? lg.data.slice(0, 66) : "0x0"); } catch { continue; }
      const amt = Number(raw) / Math.pow(10, j.tok[1]);
      if (!(amt > 0)) continue;
      const to = !j.issue && lg.topics && lg.topics[2] ? "0x" + lg.topics[2].slice(26) : "";
      mints.push({ id: c.key + ":" + lg.transactionHash + ":" + hexOrDec(lg.logIndex), sym: j.tok[0], amt, to, tx: lg.transactionHash, ts: hexOrDec(lg.timeStamp), blk: b });
    }
    await sleep(220);
  }
  if (failed.length === jobs.length) throw new Error(failed[0]);
  return { ok: true, block: latest, mints, warnings: failed };
}

// Kratka memorija u Workeru: posjetitelji unutar istog intervala dijele isti rezultat.
const MEMO = new Map();
async function memo(key, ttlMs, fn) {
  const hit = MEMO.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p;
  const p = fn();
  MEMO.set(key, { at: Date.now(), p });
  p.catch(() => MEMO.delete(key));
  if (MEMO.size > 500) MEMO.delete(MEMO.keys().next().value);
  return p;
}

async function apiRadarEvm(env) {
  const out = { updated: new Date().toISOString(), window_s: RADAR_WINDOW_S, chains: {} };
  // Mreže se provjeravaju istovremeno, da odgovor ne čeka zbroj svih čekanja.
  await Promise.all(RADAR_CHAINS.map(async (c) => {
    // Prvo javni RPC čvorovi; ako svi odbiju, Blockscout kao rezerva.
    try { out.chains[c.key] = await radarChainRpc(c); }
    catch (e) {
      try { out.chains[c.key] = await radarChain(env, c); }
      catch (e2) { out.chains[c.key] = { ok: false, err: "RPC: " + String((e && e.message) || e).slice(0, 110) + " | Blockscout: " + String((e2 && e2.message) || e2).slice(0, 80) }; }
    }
  }));
  return out;
}

async function apiRadarSol(env) {
  const d = await getMints(env, { limit_per_token: 3 });
  const cutoff = Date.now() / 1000 - RADAR_WINDOW_S;
  return {
    updated: new Date().toISOString(), slot: d.slot,
    mints: d.mints.filter((m) => !m.time || m.time >= cutoff).map((m) => ({ id: "sol:" + m.signature + ":" + m.index, sym: m.symbol, amt: m.amount, to: m.to, tx: m.signature, ts: m.time, blk: m.slot })),
  };
}

async function apiEvmTransfers(env, url) {
  const chain = url.searchParams.get("chain") || "";
  const address = (url.searchParams.get("address") || "").toLowerCase();
  const contract = (url.searchParams.get("contract") || "").toLowerCase();
  if (!BS_INSTANCES[chain]) throw new HttpError(400, "Nepoznata mreža / Unknown network.");
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new HttpError(400, "Neispravna adresa / Invalid address.");
  if (contract && !/^0x[0-9a-f]{40}$/.test(contract)) throw new HttpError(400, "Neispravan ugovor / Invalid contract.");
  const p = { module: "account", action: "tokentx", address, page: "1", offset: "1000", sort: "desc" };
  if (contract) p.contractaddress = contract;
  const result = await blockscout(env, chain, p);
  return { result };
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const API = {
  "/api/radar/evm": async (env, url) => {
    const d = await memo("radar-evm", 120000, () => apiRadarEvm(env));
    if (!url.searchParams.has("summary")) return d;
    // Kratki pregled stanja po mrežama (za provjeru bez cijelog popisa mintanja).
    const chains = {};
    for (const [k, v] of Object.entries(d.chains)) chains[k] = { ok: v.ok, err: v.err, block: v.block, mints: v.mints ? v.mints.length : 0, max: v.mints ? Math.max(0, ...v.mints.map((m) => m.amt)) : 0 };
    return { updated: d.updated, chains };
  },
  "/api/radar/sol": (env) => memo("radar-sol", 180000, () => apiRadarSol(env)),
  "/api/yields": (env, url, ctx) => memo("yields", 600000, () => getYields({ min_tvl: 100000, limit: 2000 }, ctx)),
  "/api/evm/transfers": (env, url) => memo("tx:" + url.search, 120000, () => apiEvmTransfers(env, url)),
  "/api/sol/wallet": (env, url) => memo("sw:" + url.search, 120000, () => getWallet(env, { address: url.searchParams.get("address"), pages: 3 })),
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Glavna adresa je s www; adresa bez www trajno preusmjerava na nju.
    if (url.hostname === "stablecoins-overview.mojaradnadomena.com") {
      url.hostname = "www.stablecoins-overview.mojaradnadomena.com";
      return Response.redirect(url.toString(), 301);
    }
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (API[path]) {
      try {
        const data = await API[path](env, url, ctx);
        return Response.json(data, { headers: { "cache-control": "no-store", ...SECURITY_HEADERS } });
      } catch (e) {
        return Response.json({ error: String((e && e.message) || e).slice(0, 300) }, { status: (e && e.status) || 502, headers: SECURITY_HEADERS });
      }
    }
    const page = PAGES[path];
    if (page) return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300", ...SECURITY_HEADERS } });
    return new Response(PAGES["/404"] || "Not found", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  },
};
