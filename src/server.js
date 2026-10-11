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
  { key: "eth", id: "1", issue: "0xdac17f958d2ee523a2206206994597c13d831ec7", tokens: {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": ["USDC", 6], "0xdc035d45d973e3ec169d2276ddab16f1e407384f": ["USDS", 18],
    "0x6b175474e89094c44da98b954eedeac495271d0f": ["DAI", 18], "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": ["USDe", 18],
    "0x6c3ea9036406852006290770bedfcaba0e23a0e8": ["PYUSD", 6], "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": ["USD1", 18],
    "0x8292bb45bf1ee4d140127049757c2e0ff06317ed": ["RLUSD", 18], "0xe343167631d89b6ffc58b88d6b7fb0228795491d": ["USDG", 6],
    "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c": ["EURC", 6], "0xdac17f958d2ee523a2206206994597c13d831ec7": ["USDT", 6] } },
  { key: "base", id: "8453", rpc: "https://mainnet.base.org", blockTime: 2, tokens: {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": ["USDC", 6], "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": ["EURC", 6],
    "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": ["USDe", 18] } },
  { key: "arb", id: "42161", tokens: {
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": ["USDC", 6], "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": ["USD₮0", 6],
    "0x46850ad61c2b7d64d08c9c754f45254596696984": ["PYUSD", 6], "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": ["USDe", 18] } },
  { key: "hood", id: "4663", tokens: {
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168": ["USDG", 6], "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": ["USDe", 18],
    "0xce24439f2d9c6a2289f741120fe202248b666666": ["U", 18] } },
];
const RADAR_WINDOW_S = 1800;

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

// Mreže s javnim RPC-om (Base): mintanja se čitaju izravno iz čvora, bez Blockscouta.
async function rpcCall(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { throw new Error("RPC HTTP " + r.status + ": " + t.slice(0, 160)); }
  if (j.error) throw new Error("RPC: " + (j.error.message || JSON.stringify(j.error)).slice(0, 160));
  return j.result;
}

async function radarChainRpc(c) {
  const latest = parseInt(await rpcCall(c.rpc, "eth_blockNumber", []), 16);
  const span = Math.ceil(RADAR_WINDOW_S / c.blockTime);
  // Javni Base RPC dopušta najviše 500 blokova po eth_getLogs, pa se raspon dijeli na komade.
  const logs = [];
  for (let to = latest; to > latest - span; to -= 450) {
    const from = Math.max(0, to - 449, latest - span + 1);
    logs.push(...await rpcCall(c.rpc, "eth_getLogs", [{ fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16), address: Object.keys(c.tokens), topics: [TRANSFER, ZERO32] }]));
  }
  const now = Math.floor(Date.now() / 1000), mints = [];
  for (const lg of logs) {
    const tok = c.tokens[String(lg.address).toLowerCase()];
    if (!tok) continue;
    let raw;
    try { raw = BigInt(lg.data && lg.data !== "0x" ? lg.data.slice(0, 66) : "0x0"); } catch { continue; }
    const amt = Number(raw) / Math.pow(10, tok[1]);
    if (!(amt > 0)) continue;
    const b = parseInt(lg.blockNumber, 16);
    const to = lg.topics && lg.topics[2] ? "0x" + lg.topics[2].slice(26) : "";
    // Vrijeme bloka procijenjeno iz razmaka blokova (Base: 2 s), da ne treba poziv po bloku.
    mints.push({ id: c.key + ":" + lg.transactionHash + ":" + parseInt(lg.logIndex, 16), sym: tok[0], amt, to, tx: lg.transactionHash, ts: now - (latest - b) * c.blockTime, blk: b });
  }
  return { ok: true, block: latest, mints, warnings: [] };
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
  for (const c of RADAR_CHAINS) {
    try { out.chains[c.key] = c.rpc ? await radarChainRpc(c) : await radarChain(env, c); }
    catch (e) { out.chains[c.key] = { ok: false, err: String((e && e.message) || e).slice(0, 200) }; }
  }
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
  "/api/radar/evm": (env) => memo("radar-evm", 60000, () => apiRadarEvm(env)),
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
    if (url.hostname === "stable-l1-chains.mojaradnadomena.com") {
      url.hostname = "www.stable-l1-chains.mojaradnadomena.com";
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
