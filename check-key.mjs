// check-key.mjs
import { ethers } from "ethers";
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, c, i, arr) => { if (c.startsWith("--")) a.push([c.slice(2), arr[i+1]]); return a; }, [])
);
const RPC = args.rpc || "https://polygon-rpc.com";
const LOCK = args.lock;
const WHO  = args.who;
if (!LOCK || !WHO) { console.error("Uso: node check-key.mjs --rpc <url> --lock 0x... --who 0x..."); process.exit(1); }
const ABI = [
  "function getHasValidKey(address _user) view returns (bool)",
  "function keyExpirationTimestampFor(address _user) view returns (uint256)"
];
const provider = new ethers.JsonRpcProvider(RPC);
const lock = new ethers.Contract(LOCK, ABI, provider);
const hasKey = await lock.getHasValidKey(WHO);
let exp = 0n; try { exp = await lock.keyExpirationTimestampFor(WHO); } catch {}
console.log({ hasKey, expiration: exp.toString() });
