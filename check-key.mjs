import { ethers } from "ethers";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, c, i, arr) => { if (c.startsWith("--")) a.push([c.slice(2), arr[i+1]]); return a; }, [])
);

const RPC       = args.rpc || "https://polygon-rpc.com";
const LOCK_IN   = args.lock;
const CONTRACT  = args.contract; // tu Pagocampo.sol
const WHO       = args.who;

if (!WHO) {
  console.error("Uso: node check-key.mjs --rpc <url> (--lock 0x... | --contract 0x...) --who 0x...");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC);

// ABIs mínimas
const ABI_LOCK = [
  "function getHasValidKey(address _user) view returns (bool)",
  "function keyExpirationTimestampFor(address _user) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function keyExpirationTimestampFor(uint256 tokenId) view returns (uint256)"
];
const ABI_ANCHOR = ["function unlockLock() view returns (address)"];

(async () => {
  try {
    let LOCK = LOCK_IN;

    // Si no pasaron --lock, lo leemos del contrato Pagocampo.sol (unlockLock())
    if (!LOCK) {
      if (!CONTRACT) {
        console.error("Falta --lock o --contract.");
        process.exit(1);
      }
      const anchor = new ethers.Contract(CONTRACT, ABI_ANCHOR, provider);
      LOCK = await anchor.unlockLock();
      console.log("🔓 Lock leído desde Pagocampo.sol:", LOCK);
    }

    const lock = new ethers.Contract(LOCK, ABI_LOCK, provider);

    const hasKey = await lock.getHasValidKey(WHO);
    let expAddr = 0n;
    try {
      expAddr = await lock.keyExpirationTimestampFor(WHO); // v8–v10
    } catch {}

    // Si expAddr no sirve (0 o falló), probamos ruta por tokenId (v11+)
    let expByToken = 0n;
    if (expAddr === 0n) {
      try {
        const bal = await lock.balanceOf(WHO);
        if (bal > 0n) {
          const tid = await lock.tokenOfOwnerByIndex(WHO, 0);
          expByToken = await lock.keyExpirationTimestampFor(tid);
        }
      } catch {}
    }

    const exp = expAddr !== 0n ? expAddr : expByToken;

    console.log({
      rpc: RPC,
      lock: LOCK,
      who: WHO,
      hasKey,
      expiration_unix: exp.toString(),
      expiration_iso: exp > 0n ? new Date(Number(exp) * 1000).toISOString() : null
    });
  } catch (e) {
    console.error("✗ Error:", e?.reason || e?.message || String(e));
    process.exit(1);
  }
})();



