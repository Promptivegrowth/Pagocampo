// grant-key.mjs  — otorga (grant) una key en Unlock
import { ethers } from "ethers";

// ABI mínimo para locks de Unlock (cubriendo variantes)
const PUBLIC_LOCK_ABI = [
  "function grantKeys(address[] recipients, uint256[] expirationTimestamps, address[] keyManagers)",
  "function grantKey(address recipient, address keyManager, uint256 expirationTimestamp)",
  "function getHasValidKey(address _user) view returns (bool)",
  "function keyExpirationTimestampFor(address _user) view returns (uint256)"
];

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const rpc   = arg("rpc");
  const pk    = arg("pk");
  const lock  = arg("lock");
  const to    = arg("to");
  const days  = Number(arg("days", "365"));

  if (!rpc || !pk || !lock || !to) {
    console.error(
      "Uso: node grant-key.mjs --rpc <RPC_URL> --pk <PRIVATE_KEY> --lock <LOCK_ADDR> --to <BENEFICIARY_ADDR> [--days 365]"
    );
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet   = new ethers.Wallet(pk, provider);
  const contract = new ethers.Contract(lock, PUBLIC_LOCK_ABI, wallet);

  const network  = await provider.getNetwork();
  console.log("🌐 Chain:", network.chainId.toString());
  console.log("🔑 Signer:", wallet.address);
  console.log("🔒 Lock  :", lock);
  console.log("👥 To    :", to);

  // expira en N días
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.max(1, days) * 86400;

  // intentamos primero la forma batch (grantKeys); si no existe, probamos grantKey
  let fn;
  try {
    fn = contract.getFunction("grantKeys");
  } catch {
    try {
      fn = contract.getFunction("grantKey");
    } catch {
      console.error("✗ Este lock no expone ni grantKeys ni grantKey");
      process.exit(1);
    }
  }

  let tx;
  if (fn.name === "grantKeys") {
    console.log("→ calling grantKeys([...])");
    tx = await contract.grantKeys([to], [exp], [ethers.ZeroAddress]);
  } else {
    console.log("→ calling grantKey(...)");
    tx = await contract.grantKey(to, ethers.ZeroAddress, exp);
  }

  console.log("📤 TX enviada:", tx.hash);
  const rcpt = await tx.wait();
  console.log("✅ Confirmada en bloque:", rcpt.blockNumber);

  const has   = await contract.getHasValidKey(to);
  const expTs = await contract.keyExpirationTimestampFor(to);
  console.log("🔎 hasValidKey:", has, "| exp:", expTs.toString());
}

main().catch((e) => {
  console.error("✗ Error:", e?.reason || e?.shortMessage || e?.message || e);
  process.exit(1);
});
