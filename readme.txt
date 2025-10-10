PagoCampo – Demo Hackatón

Polygon prueba que ocurrió.
Filecoin/IPFS (Lighthouse) muestra qué ocurrió.
Unlock demuestra quién tiene derecho sobre lo que ocurrió.

Este repo contiene una API en Firebase Functions v2 (Node.js 22) que:

Recibe un intento de pago (/intents) y envía un SMS al “Virtual Phone”.

Simula el inbound SMS (/sms/inbound) con el formato PAGAR <monto> <código>.

Genera un recibo JSON, lo sube a Filecoin/IPFS vía Lighthouse (obtienes un CID).

Ancla un evento en Polygon llamando tu contrato (anchorReceipt).

(Opcional en demo) Marca éxito por cron y envía SMS de confirmación.

📌 Servicios usados: Firebase Functions + Firestore, Twilio (Virtual Phone o WhatsApp Sandbox), Lighthouse (Filecoin/IPFS), Polygon (mainnet 137), Unlock (LLave/Key como “recibo NFT” opcional).

Arquitectura (resumen)

/intents: guardas intento en Firestore → envías SMS de invitación.

/sms/inbound: al recibir PAGAR monto código:

Prepara recibo.json y lo sube a Lighthouse → cid.

Llama anchorReceipt en Polygon → txHash.

Guarda todo en Firestore (SENT_ON_CHAIN → SUCCESS).

Cron: confirma y envía SMS de éxito (modo demo).

Requisitos

Node.js 20/22

Firebase CLI: npm i -g firebase-tools

Proyecto Firebase configurado y Functions v2 habilitado

Twilio (mensajería saliente a Virtual Phone o WA Sandbox)

Lighthouse API key

RPC/PK/ADDR/BENEFICIARY para el contrato en Polygon

Variables/Secretos (Firebase)

Configura los secretos una sola vez:

firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_MSG_SERVICE_SID
firebase functions:secrets:set TWILIO_VIRTUAL_TO

firebase functions:secrets:set LIGHTHOUSE_API_KEY

firebase functions:secrets:set ANCHOR_RPC            # RPC de Polygon
firebase functions:secrets:set ANCHOR_PK             # Private key del relayer (0x...)
firebase functions:secrets:set ANCHOR_ADDR           # Dirección del contrato ReceiptAnchor
firebase functions:secrets:set ANCHOR_BENEFICIARY    # Wallet beneficiaria (debe tener key Unlock)


Nunca subas estas llaves al repo. Se consumen en tiempo de ejecución vía defineSecret.

Despliegue
firebase deploy --only functions


Cuando termine, verás la URL base del servicio (Cloud Run).
En este README usaremos:

BASE=https://api-jjeai53xva-uc.a.run.app

Demo end-to-end (P2P)

Formato de pago por SMS (simulado):
PAGAR <monto> <código> [nota opcional]
El backend usa solo los 3 primeros tokens. Lo demás puede ser comentario para la demo.

macOS / Linux (bash)
BASE="https://api-jjeai53xva-uc.a.run.app"

# 1) Intento de pago: PAPA
curl -sS -X POST "$BASE/intents" -H "Content-Type: application/json" \
  -d '{
    "phone":"+519168568482",
    "amount":"25.00",
    "code":"PC-PAPA-2025-001"
  }'

# 2) Simular inbound: PAGA PAPA
curl -sS -X POST "$BASE/sms/inbound" -H "Content-Type: application/x-www-form-urlencoded" \
  --data "From=%2B519168568482&Body=PAGAR%2025.00%20PC-PAPA-2025-001%20Compra%20Papa%20Yungay%2010kg"

# 3) Intento de pago: ARROZ
curl -sS -X POST "$BASE/intents" -H "Content-Type: application/json" \
  -d '{
    "phone":"+519168568482",
    "amount":"21.00",
    "code":"PC-ARROZ-2025-001"
  }'

# 4) Simular inbound: PAGA ARROZ
curl -sS -X POST "$BASE/sms/inbound" -H "Content-Type: application/x-www-form-urlencoded" \
  --data "From=%2B519168568482&Body=PAGAR%2021.00%20PC-ARROZ-2025-001%20Arroz%20Superior%205kg"

Windows (CMD)
set "BASE=https://api-jjeai53xva-uc.a.run.app"

REM 1) Intento PAPA
curl -sS -X POST "%BASE%/intents" -H "Content-Type: application/json" -d "{\"phone\":\"+519168568482\",\"amount\":\"25.00\",\"code\":\"PC-PAPA-2025-001\"}"

REM 2) Inbound PAPA
curl -sS -X POST "%BASE%/sms/inbound" -H "Content-Type: application/x-www-form-urlencoded" --data "From=%2B519168568482&Body=PAGAR%2025.00%20PC-PAPA-2025-001%20Compra%20Papa%20Yungay%2010kg"

REM 3) Intento ARROZ
curl -sS -X POST "%BASE%/intents" -H "Content-Type: application/json" -d "{\"phone\":\"+519168568482\",\"amount\":\"21.00\",\"code\":\"PC-ARROZ-2025-001\"}"

REM 4) Inbound ARROZ
curl -sS -X POST "%BASE%/sms/inbound" -H "Content-Type: application/x-www-form-urlencoded" --data "From=%2B519168568482&Body=PAGAR%2021.00%20PC-ARROZ-2025-001%20Arroz%20Superior%205kg"


Puedes disparar desde cualquier PC (o desde el frontend de tu amigo) porque son simples llamadas HTTP a tu API pública.