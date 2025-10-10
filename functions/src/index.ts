import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import express from "express";
import { createHash } from "crypto";
import Twilio from "twilio";


// -----------------------------------------------------------------------------
// Firebase
// -----------------------------------------------------------------------------
admin.initializeApp();
const db = admin.firestore();

// -----------------------------------------------------------------------------
// Secrets
// -----------------------------------------------------------------------------
const S_TWILIO_SID             = defineSecret("TWILIO_ACCOUNT_SID");
const S_TWILIO_TOKEN           = defineSecret("TWILIO_AUTH_TOKEN");
const S_TWILIO_MSG_SERVICE_SID = defineSecret("TWILIO_MSG_SERVICE_SID");
const S_TWILIO_VIRTUAL_TO      = defineSecret("TWILIO_VIRTUAL_TO");

const S_LIGHTHOUSE_KEY         = defineSecret("LIGHTHOUSE_API_KEY");

const S_RPC                    = defineSecret("ANCHOR_RPC");
const S_PK                     = defineSecret("ANCHOR_PK");
const S_ADDR                   = defineSecret("ANCHOR_ADDR");
const S_BENEFICIARY            = defineSecret("ANCHOR_BENEFICIARY");

// Flag de demo para confirmación por cron (si lo pones en "0" no se autoconfirma)
const MOCK_ONCHAIN = (process.env.MOCK_ONCHAIN || "1") === "1";

// DID a anclar junto al recibo (ajústalo si tienes uno propio)
const SPACE_DID_DEFAULT = "did:web:lighthouse.storage";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const sha256hex = (s: string) =>
  "0x" + createHash("sha256").update(s).digest("hex");
const toCents = (s: string) =>
  Math.round(parseFloat(String(s).replace(",", ".")) * 100);

type TwilioClient = ReturnType<typeof Twilio>;
function makeTwilio() {
  const sid = S_TWILIO_SID.value();
  const tok = S_TWILIO_TOKEN.value();
  const msgSid = S_TWILIO_MSG_SERVICE_SID.value();
  const virtualTo = S_TWILIO_VIRTUAL_TO.value();
  const twilio = sid && tok ? Twilio(sid, tok) : null;
  return { twilio, msgSid, virtualTo };
}

// -----------------------------------------------------------------------------
// Upload a Filecoin/IPFS via Lighthouse (Node 20+/22: fetch/Blob/FormData nativos)
// -----------------------------------------------------------------------------
async function uploadReceiptToFilecoin(data: any) {
  const apiKey = S_LIGHTHOUSE_KEY.value();

  if (!apiKey) {
    console.warn("⚠ Missing Lighthouse API key → NO se subirá a Filecoin.");
    throw new Error("LIGHTHOUSE_API_KEY missing");
  }

  try {
    console.log("→ Uploading receipt to Filecoin via Lighthouse...");

    const filename = `${data.code || data.intentId}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const form = new FormData();
    form.append("file", blob, filename);

    const response = await fetch(
      "https://node.lighthouse.storage/api/v0/add",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Lighthouse error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const cid = result.Hash;

    console.log(`✓ Receipt uploaded to Filecoin: ${cid}`);
    return {
      cid,
      url: `https://gateway.lighthouse.storage/ipfs/${cid}`,
      provider: "lighthouse",
    };
  } catch (error) {
    console.error("✗ Error uploading to Lighthouse/Filecoin:", error);
    throw error;
  }
}

// -----------------------------------------------------------------------------
// ABI del contrato y ABI de Unlock (para preflight)
// -----------------------------------------------------------------------------
const ANCHOR_ABI = [
  // eventos
  "event ReceiptAnchored(bytes32 indexed cidHash, string cid, string intentId, string spaceDid, address indexed relayer)",
  // funciones usadas
  "function anchorReceipt(string cid, string intentId, string spaceDid, address beneficiary) external",
  "function relayers(address a) view returns (bool)",
  "function paused() view returns (bool)",
  "function unlockLock() view returns (address)",
  // custom error del contrato v2
  "error NoValidUnlockKey()",
];

const PUBLIC_LOCK_ABI = [
  "function getHasValidKey(address _user) view returns (bool)",
  "function keyExpirationTimestampFor(address _user) view returns (uint256)",    // v8-v10
  "function keyExpirationTimestampFor(uint256 _tokenId) view returns (uint256)", // v11+
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)"
];

// -----------------------------------------------------------------------------
// Anchor on Polygon (relayer + gate Unlock + staticCall + decodificación de revert)
// -----------------------------------------------------------------------------
async function anchorOnPolygon(
  cid: string,
  intentId: string,
  spaceDid: string
): Promise<string> {
  const rpc  = S_RPC.value();
  const pk   = S_PK.value();
  const addr = S_ADDR.value();

  if (!rpc || !pk || !addr) {
    console.warn("⚠ Missing blockchain secrets, returning mock txHash (solo demo).");
    return "0x" + createHash("sha256").update(cid + intentId + Date.now()).digest("hex");
  }

  const { ethers } = await import("ethers");
  const provider    = new ethers.JsonRpcProvider(rpc);
  const wallet      = new ethers.Wallet(pk.startsWith("0x") ? pk : "0x" + pk, provider);
  const sender      = ethers.getAddress(wallet.address);
  const beneficiary = ethers.getAddress((S_BENEFICIARY.value()?.trim() as string) || sender);
  const contract    = new ethers.Contract(addr, ANCHOR_ABI, wallet);

  const net = await provider.getNetwork();
  console.log("\n========== 🔗 ANCHORING TO POLYGON ==========");
  console.log(`🌐 Chain: ${net.chainId} (${net.name})`);
  console.log("📍 Contract:", addr);
  console.log("📦 CID:", cid);
  console.log("🆔 IntentID:", intentId);
  console.log("🧭 spaceDid:", spaceDid);
  console.log("👤 Sender (relayer):", sender);
  console.log("👥 Beneficiary:", beneficiary);

  // 0) Pausa
  try {
    const isPaused: boolean = await contract.paused();
    console.log("⏸️ paused():", isPaused);
    if (isPaused) throw Object.assign(new Error("PAUSED"), { reason: "PAUSED" });
  } catch (e: any) {
    if (e?.reason === "PAUSED" || e?.message === "PAUSED") throw e;
    console.warn("⚠ No se pudo leer paused():", e?.message);
  }

  // 1) ¿EL SENDER ES RELAYER?
  try {
    const isRelayerSender = await contract.relayers(sender);
    const isRelayerBenef  = await contract.relayers(beneficiary).catch(() => false);
    console.log(`🔐 relayers[sender]=${isRelayerSender} | relayers[beneficiary]=${isRelayerBenef}`);
    if (!isRelayerSender) {
      const err = Object.assign(new Error("NOT_RELAYER"), { reason: "NOT_RELAYER" });
      throw err;
    }
  } catch (e: any) {
    if (e?.reason === "NOT_RELAYER" || e?.message === "NOT_RELAYER") throw e;
    console.warn("⚠ No se pudo verificar relayer (o función no existe):", e?.message);
  }

// 2) Gate de Unlock: ¿beneficiary tiene key válida?
try {
  const lockAddr: string = await contract.unlockLock();
  console.log("🔓 Unlock Lock Address:", lockAddr);

  const lock = new ethers.Contract(lockAddr, PUBLIC_LOCK_ABI, provider);

  // Base: getHasValidKey
  const hasKey: boolean = await lock.getHasValidKey(beneficiary).catch(() => false);

  // Intentamos leer expiración con compatibilidad v8–v11+
  let expTs = 0n;
  try { 
    // firma antigua (por address)
    expTs = await lock.keyExpirationTimestampFor(beneficiary);
  } catch {}

  // Si exp=0, probamos camino por tokenId (v11+)
  if (expTs === 0n) {
    try {
      const bal: bigint = await lock.balanceOf(beneficiary);
      if (bal > 0n) {
        const tokenId: bigint = await lock.tokenOfOwnerByIndex(beneficiary, 0);
        expTs = await lock.keyExpirationTimestampFor(tokenId);
      }
    } catch {}
  }

  console.log(`🔑 hasValidKey=${hasKey} | ⏳ expiration=${expTs.toString()}`);

  if (!hasKey) {
    throw Object.assign(new Error("NO_VALID_UNLOCK_KEY"), { reason: "NO_VALID_UNLOCK_KEY" });
  }
} catch (e: any) {
  if (e?.reason === "NO_VALID_UNLOCK_KEY" || e?.message === "NO_VALID_UNLOCK_KEY") throw e;
  console.warn("⚠ No se pudo verificar key de Unlock:", e?.message);
}

  // ⬇️ Helper SINCRÓNICO (nada de await aquí)
  const decodeRevert = (err: any) => {
    try {
      if (err?.reason) return `reason: ${err.reason}`;
      if (err?.shortMessage) return err.shortMessage;
      if (err?.data) {
        const iface = new ethers.Interface(ANCHOR_ABI);
        const parsed = iface.parseError(err.data);
        if (parsed?.name) return `error: ${parsed.name} args=${JSON.stringify(parsed.args)}`;
      }
    } catch {}
    return String(err?.message || err);
  };

  // 3) staticCall (preflight)
  const fn = contract.getFunction("anchorReceipt") as any;
  console.log("→ staticCall...");
  try {
    await fn.staticCall(cid, intentId, spaceDid, beneficiary);
    console.log("✅ staticCall OK (debería mintear).");
  } catch (e: any) {
    console.error("❌ staticCall revirtió →", decodeRevert(e));
    throw e;
  }

  // 4) estimateGas + gasLimit con margen
  let gasLimit: bigint = 330_000n;
  try {
    const est = await fn.estimateGas(cid, intentId, spaceDid, beneficiary);
    gasLimit = est + est / 10n; // +10%
    console.log("⛽ gas estimated:", est.toString(), "→ gasLimit:", gasLimit.toString());
  } catch {
    console.warn("⚠ estimateGas falló, usando gasLimit por defecto:", gasLimit.toString());
  }

  // 5) enviar tx
  console.log("→ sending tx...");
  const tx = await fn(cid, intentId, spaceDid, beneficiary, { gasLimit });
  console.log("📤 TX:", tx.hash);
  console.log("⏳ Esperando confirmación...");
  const rcpt = await tx.wait();
  console.log("✅ TX confirmada en bloque:", rcpt.blockNumber, "gasUsed:", rcpt.gasUsed.toString());
  console.log("========== ✅ ANCHOR EXITOSO ==========\n");
  return tx.hash;
}

// -----------------------------------------------------------------------------
// Twilio: enviar siempre al Inbox Virtual
// -----------------------------------------------------------------------------
async function sendToVirtualPhone(
  twilio: TwilioClient | null,
  msgSid: string | undefined,
  virtualTo: string | undefined,
  body: string
) {
  if (!twilio || !msgSid || !virtualTo) {
    console.warn("⚠ Missing Twilio credentials. Message:", body);
    return;
  }
  try {
    await twilio.messages.create({
      to: virtualTo,
      messagingServiceSid: msgSid,
      body,
    });
    console.log("✓ SMS sent to virtual phone");
  } catch (error) {
    console.error("✗ Error sending SMS:", error);
  }
}

// -----------------------------------------------------------------------------
// Express app
// -----------------------------------------------------------------------------
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 1) Crear intento y enviar invitación  (REEMPLAZAR ESTE BLOQUE)
app.post("/intents", async (req, res) => {
  try {
    const { phone, amount, code, payerName, toName, toPhone, toAddr, note } = req.body as {
      phone: string; amount: string; code: string;
      payerName?: string; toName?: string; toPhone?: string; toAddr?: string; note?: string;
    };

    if (!phone || !amount || !code) {
      return res.status(400).json({ ok: false, error: "missing fields" });
    }

    const amountCents = toCents(amount);
    const intentId = sha256hex(code);
    const payerMsisdnHash = sha256hex(phone);
    const payeeMsisdnHash = toPhone ? sha256hex(toPhone) : null;

    await db.collection("intents").doc(code).set(
      {
        intentId,
        amount: amountCents,
        from: phone,
        to: toPhone || null,
        toAddr: toAddr?.trim() || null,
        payerName: payerName || null,
        payeeName: toName || null,
        payerPhoneMasked: phone ? phone.replace(/\d(?=\d{2})/g, "•") : null,
        payeePhoneMasked: toPhone ? toPhone.replace(/\d(?=\d{2})/g, "•") : null,
        payerMsisdnHash,
        payeeMsisdnHash,
        note: note || null,
        status: "INVITE_SENT",
        createdAt: Date.now(),
      },
      { merge: true }
    );

    // Mensaje “bonito” para el jurado (nombre emisor, monto, destinatario y clave)
    const whoPays = payerName ? `${payerName}` : "El usuario";
    const whoGets = toName ? ` a ${toName}` : (toPhone ? ` a ${toPhone}` : "");
    const text =
      `PagoCampo: ${whoPays} pagará S/ ${amount}${whoGets}. ` +
      `Clave: ${code}. Responde: PAGAR ${amount} ${code}`;

    const { twilio, msgSid, virtualTo } = makeTwilio();
    await sendToVirtualPhone(twilio, msgSid, virtualTo, text);

    console.log(`✓ Intent created: ${code}`);
    return res.json({ ok: true, intentId });
  } catch (e: any) {
    console.error("✗ Error creating intent:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// 2) Webhook inbound (simulado)  (REEMPLAZAR ESTE BLOQUE)
app.post("/sms/inbound", async (req, res) => {
  try {
    const from = (req.body.From || req.body.FromNumber || req.body.msisdn || "")
      .toString()
      .trim();
    const body = (req.body.Body || req.body.text || "").toString().trim();

    console.log("→ INBOUND SMS:", { from, body });
    if (!body) return res.status(200).send("OK");

    const text = body.toUpperCase();
    if (!text.startsWith("PAGAR")) return res.status(200).send("OK");

    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      console.warn("⚠ Invalid SMS format");
      return res.status(200).send("OK");
    }

    const amountCents = toCents(parts[1]);
    const code = parts[2];
    const intentId = sha256hex(code);
    const payerMsisdnHash = sha256hex(from);
    const ts = Date.now();

    console.log(`\n🚀 Processing payment: ${code}`);

    // Traer intent para leer nombres, receptor y address opcional
    const intentRef = db.collection("intents").doc(code);
    const snap = await intentRef.get();
    const it = (snap.exists ? snap.data() : {}) as any;

    const payeePhone: string | null = it?.to || null;
    const payeeMsisdnHash: string | null = it?.payeeMsisdnHash || (payeePhone ? sha256hex(payeePhone) : null);
    const toAddr: string | null = it?.toAddr || null;

    await intentRef.set(
      {
        intentId,
        amount: amountCents,
        from,
        payerMsisdnHash,
        payeeMsisdnHash,
        status: "PENDING",
        createdAt: it?.createdAt || ts,
        updatedAt: ts,
      },
      { merge: true }
    );

    // Recibo legible para Filecoin/IPFS (con nombres + clave + vista previa del SMS)
    const receipt = {
      version: 2,
      channel: "virtualPhone",
      code,                       // "clave"
      intentId,
      amountCents,
      ts,
      messagePreview: `PAGAR ${parts[1]} ${code}`,
      payer: {
        name: it?.payerName || null,
        phone: from,
        msisdnHash: payerMsisdnHash,
      },
      payee: {
        name: it?.payeeName || null,
        phone: payeePhone,
        msisdnHash: payeeMsisdnHash,
        address: toAddr,
      },
      note: it?.note || null,
    };

    console.log("📦 Receipt data:", receipt);

    // 1) Subir a Filecoin/IPFS
    const { cid, url, provider } = await uploadReceiptToFilecoin(receipt);
    console.log("✅ Filecoin upload complete");

    // 2) Anchor en Polygon con DID (beneficiary definido por secreto S_BENEFICIARY)
    const spaceDid = SPACE_DID_DEFAULT;
    const txHash = await anchorOnPolygon(cid, intentId, spaceDid);
    console.log("✅ Polygon anchor complete");

    // 3) Guardar
    await intentRef.set(
      {
        cid,
        cidUrl: url,
        provider,
        spaceDid,
        txHash,
        status: "SENT_ON_CHAIN",
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    console.log(`✅ Payment processed successfully: ${code}\n`);
    return res.status(200).send("OK");
  } catch (e: any) {
    console.error("❌ Error processing inbound SMS:", e?.message);
    // Persistimos el error si tenemos el code
    try {
      const maybe = (req.body.Body || req.body.text || "").toString().trim();
      const codeFromBody = maybe.split(/\s+/)?.[2];
      if (codeFromBody) {
        await db.collection("intents").doc(codeFromBody).set(
          {
            status: "ERROR",
            error: e?.message || String(e),
            errorData: {
              reason: e?.reason || null,
              code: e?.code || null,
              data: e?.data || null,
              shortMessage: e?.shortMessage || null,
            },
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }
    } catch {}
    return res.status(200).send("OK");
  }
});

// 3) Confirmación manual (por si el cron no corre a tiempo en vivo)
app.post("/admin/confirm-all", async (_req, res) => {
  try {
    const snap = await db
      .collection("intents")
      .where("status", "==", "SENT_ON_CHAIN")
      .get();

    const { twilio, msgSid, virtualTo } = makeTwilio();

    for (const doc of snap.docs) {
      await doc.ref.set(
        {
          status: "SUCCESS",
          confirmedAt: Date.now(),
        },
        { merge: true }
      );
    }

    await sendToVirtualPhone(
      twilio,
      msgSid,
      virtualTo,
      "✅ Confirmación manual enviada."
    );
    console.log(`✓ Confirmed ${snap.size} payments`);
    res.json({ ok: true, confirmed: snap.size });
  } catch (error) {
    console.error("✗ Error in manual confirmation:", error);
    res.status(500).json({ ok: false, error: String(error) });
  }
});

// 4) Endpoint de DEBUG rápido
app.get("/admin/debug", async (_req, res) => {
  try {
    const rpc  = S_RPC.value();
    const pk   = S_PK.value();
    const addr = S_ADDR.value();
    const { ethers } = await import("ethers");
    const provider    = new ethers.JsonRpcProvider(rpc);
    const wallet      = new ethers.Wallet(pk.startsWith("0x") ? pk : ("0x" + pk), provider);
    const sender      = ethers.getAddress(wallet.address);
    const beneficiary = ethers.getAddress((S_BENEFICIARY.value()?.trim() as string) || sender);
    const contract    = new ethers.Contract(addr, ANCHOR_ABI, provider);

    const net = await provider.getNetwork();
    const isRelayerSender      = await contract.relayers(sender).catch(() => false);
    const isRelayerBeneficiary = await contract.relayers(beneficiary).catch(() => false);
    const lockAddr             = await contract.unlockLock().catch(() => "0x");
    const paused               = await (async () => {
      try { return await contract.paused(); } catch { return null; }
    })();

    res.json({
      chainId: net.chainId, network: net.name,
      contract: addr,
      paused,
      sender, beneficiary,
      relayers: { sender: isRelayerSender, beneficiary: isRelayerBeneficiary },
      unlockLock: lockAddr
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// -----------------------------------------------------------------------------
// Export HTTP function (v2)
// -----------------------------------------------------------------------------
export const api = onRequest(
  {
    region: "us-central1",
    secrets: [
      S_TWILIO_SID,
      S_TWILIO_TOKEN,
      S_TWILIO_MSG_SERVICE_SID,
      S_TWILIO_VIRTUAL_TO,
      S_LIGHTHOUSE_KEY,
      S_RPC,
      S_PK,
      S_ADDR,
      S_BENEFICIARY,
    ],
  },
  (req, res) => app(req, res)
);

// -----------------------------------------------------------------------------
// Cron: marca SUCCESS y envía confirmación al INBOX VIRTUAL
// -----------------------------------------------------------------------------
export const confirmSent = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "us-central1",
    secrets: [
      S_TWILIO_SID,
      S_TWILIO_TOKEN,
      S_TWILIO_MSG_SERVICE_SID,
      S_TWILIO_VIRTUAL_TO,
    ],
  },
  async () => {
    try {
      const snapshot = await db
        .collection("intents")
        .where("status", "==", "SENT_ON_CHAIN")
        .get();

      const { twilio, msgSid, virtualTo } = makeTwilio();

      for (const doc of snapshot.docs) {
        const d = doc.data() as any;
        try {
          if (MOCK_ONCHAIN) {
            await doc.ref.set(
              {
                status: "SUCCESS",
                confirmedAt: Date.now(),
              },
              { merge: true }
            );
            const msg = `Pago recibido ✅ Tx: ${d.txHash || "MOCK"}. Recibo: ${d.cidUrl || "no-cid"}`;
            await sendToVirtualPhone(twilio, msgSid, virtualTo, msg);
            console.log(`✓ Confirmed payment: ${doc.id}`);
          } else {
            // TODO: opcionalmente, leer eventos ReceiptAnchored para confirmar on-chain
          }
        } catch (err) {
          console.error(`✗ Error confirming ${doc.id}:`, err);
        }
      }
    } catch (error) {
      console.error("✗ Error in confirmSent cron:", error);
    }
  }
);
