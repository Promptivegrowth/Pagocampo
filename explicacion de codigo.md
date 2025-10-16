# PagoCampo — Filecoin/IPFS (Lighthouse) + Unlock + **Billetera Custodial** vinculada al teléfono


## 1) Resumen del flujo con **billetera custodial ←→ número telefónico**
1. El usuario se registra con su **número telefónico** (MSISDN). El sistema crea/asigna una **billetera custodial EVM** (p. ej. mediante un servicio de custodia o KMS propio) y guarda el **mapeo**:  
   `MSISDN → custodialAddress` (en Firestore o base segura).
2. Esa **billetera custodial** es la **titular de la membresía de Unlock** (la “key” válida en el Lock).  
3. **Creación de intento** (`POST /intents` en `index.ts`): se guarda en Firestore y se envía invitación al **Inbox Virtual** de Twilio.
4. **Pago por SMS** (`POST /sms/inbound`): se construye un **recibo JSON**, se sube a **Filecoin/IPFS vía Lighthouse**, y se **ancla** el **CID** en Polygon llamando al contrato `Pagocampo.sol`.  
   Antes de anclar, se verifica que el **beneficiario** (la **billetera custodial asociada al número del pagante**) **tenga key válida** en Unlock.
5. Se persisten `cidUrl` y `txHash`; el estado pasa `SENT_ON_CHAIN → SUCCESS` (cron/confirmación).

> **Nota**: En la versión demo provista, el beneficiario viene de `S_BENEFICIARY`. Para producción, se reemplaza por el **mapeo teléfono → custodialAddress** (ver §3.2).

---

## 2) Dónde se integra **Filecoin/IPFS** (Lighthouse) — `index.ts`
Función `uploadReceiptToFilecoin(data)`: crea un **Blob** con el recibo JSON y lo publica contra `https://node.lighthouse.storage/api/v0/add` con bearer `LIGHTHOUSE_API_KEY`. Devuelve `{ cid, url, provider }`.

> **Código citado (backend `index.ts`):**
```ts
async function uploadReceiptToFilecoin(data: any) {
  const apiKey = S_LIGHTHOUSE_KEY.value();
  const filename = `${data.code || data.intentId}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const form = new FormData(); form.append("file", blob, filename);
  const response = await fetch("https://node.lighthouse.storage/api/v0/add", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form
  });
  const result = await response.json();
  const cid = result.Hash;
  return { cid, url: `https://gateway.lighthouse.storage/ipfs/${cid}`, provider: "lighthouse" };
}
```
Se invoca dentro de `POST /sms/inbound` **antes** del anclaje:
```ts
const { cid, url, provider } = await uploadReceiptToFilecoin(receipt);
```




## 3) **Unlock** con **billetera custodial** vinculada al teléfono
### 3.1 En el contrato (`Pagocampo.sol`)
Se exige membresía Unlock **del beneficiario** con `getHasValidKey(...)` sobre `unlockLock`. Si no tiene key, **revierte** con `NoValidUnlockKey()`.

Contrato ReceiptAnchorV2

https://polygonscan.com/address/0x4bca0a3fe8a7abe4f47c713905538d4f14845558#code

> **Código citado (núcleo del contrato):**
```solidity
interface IPublicLock {
    function getHasValidKey(address _owner) external view returns (bool);
}

contract Pagocampo {
    address public immutable unlockLock;
    error NoValidUnlockKey();
    error NotAuthorized();

    constructor(address _lock) {
        require(_lock != address(0), "LOCK_REQUIRED");
        owner = msg.sender;
        relayers[msg.sender] = true;
        unlockLock = _lock;
    }

    function _requireMembership(address beneficiary) internal view {
        if (!IPublicLock(unlockLock).getHasValidKey(beneficiary)) revert NoValidUnlockKey();
    }

    function anchorReceipt(
        string calldata cid, string calldata intentId, string calldata spaceDid, address beneficiary
    ) external whenNotPaused returns (bytes32 cidHash) {
        _requireMembership(beneficiary);
        _requireAuthorized(beneficiary);
        // ... guarda recibo y emite ReceiptAnchored
    }
}
```
> *`Pagocampo.sol` es el mismo contrato presentado (antes `ReceiptAnchorV2`) con nombre actualizado.*

### 3.2 En el backend (`index.ts`) — resolver **beneficiario** desde el teléfono
En el flujo real, el **beneficiario** debe ser la **billetera custodial** asociada al **número del pagante**. Recomendación de implementación (pseudo‑código compatible con tu código actual):
3.1 ¿Dónde se hace cumplir? — Contrato Pagocampo.sol

El contrato guarda la dirección del Lock de Unlock (unlockLock).

Antes de anclar, verifica membresía con getHasValidKey(beneficiary).

Si el usuario no tiene key válida, revierte con NoValidUnlockKey().

Contrato en Polygonscan:
https://polygonscan.com/address/0x4bca0a3fE8A7ABE4F47c713905538D4F14845558#code

Núcleo del contrato (extracto):

interface IPublicLock {
    function getHasValidKey(address _owner) external view returns (bool);
}

contract Pagocampo {
    address public immutable unlockLock;
    error NoValidUnlockKey();
    // ...

    function _requireMembership(address beneficiary) internal view {
        if (!IPublicLock(unlockLock).getHasValidKey(beneficiary)) revert NoValidUnlockKey();
    }

    function anchorReceipt(
        string calldata cid, string calldata intentId, string calldata spaceDid, address beneficiary
    ) external returns (bytes32 cidHash) {
        _requireMembership(beneficiary);   // ← requiere key válida en Unlock
        // ... guarda recibo y emite ReceiptAnchored
    }
}

3.2 ¿Cómo se vincula el teléfono con la billetera? — Backend index.ts

En el backend resolvemos el beneficiario desde el teléfono del pagante (billetera custodial).
(Si no existe aún el mapeo, se puede usar un beneficiario por defecto para la demo.)

Idea de implementación (extracto):

// msisdn (teléfono) -> custodialAddress (Firestore: wallets/{msisdnHash})
async function resolveCustodialAddress(msisdn: string): Promise<string> {
  const h = sha256hex(msisdn);
  const doc = await db.collection("wallets").doc(h).get();
  if (!doc.exists) throw new Error("NO_CUSTODIAL_WALLET");
  return (doc.data() as any).address;
}

// En /sms/inbound: usamos el teléfono 'from' para obtener el beneficiary
const { ethers } = await import("ethers");
const beneficiary = ethers.getAddress(await resolveCustodialAddress(from));
// Luego anclamos (anchorOnPolygon hace la verificación Unlock y el envío de la TX)
const txHash = await anchorOnPolygon(cid, intentId, "did:web:lighthouse.storage");


Qué demuestra esto: la key de Unlock pertenece a la billetera custodial que está ligada al número de teléfono del pagante. Sin key válida, el contrato no permite anclar.

3.3 Prueba en vivo (terminal) — Verificar Unlock para la billetera custodial

Usamos el script check-key.mjs (proporcionado) para consultar Unlock en la red Polygon.

Contrato Pagocampo: 0x4bCA0a3fE8A7ABE4F47c713905538D4F14845558
Billetera custodial (demo): 0x6E51a8a6A3243C7c569793C349CE3f235850ce92

Windows (CMD) — recomendado (el script lee el Lock desde el contrato):

node check-key.mjs --rpc https://polygon-rpc.com --contract 0x4bCA0a3fE8A7ABE4F47c713905538D4F14845558 --who 0x6E51a8a6A3243C7c569793C349CE3f235850ce92


Salida esperada (ejemplo):

{
  "rpc": "https://polygon-rpc.com",
  "lock": "0x....",
  "who": "0x6E51a8a6A3243C7c569793C349CE3f235850ce92",
  "hasKey": true,
  "expiration_unix": "1731974400",
  "expiration_iso": "2025-11-19T00:00:00.000Z"
}

