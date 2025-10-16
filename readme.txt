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


Windows (CMD)
EJEMPLO 1
INVITAR
curl -sS -X POST "https://api-jjeai53xva-uc.a.run.app/intents" -H "Content-Type: application/json" -d "{\"phone\":\"+519168568482\",\"amount\":\"25.00\",\"code\":\"PC-GUSTAVO-2025-001\",\"payerName\":\"Juan Pérez\",\"payeeName\":\"Ana Quispe\",\"payeePhone\":\"+51999999999\",\"currency\":\"PEN\",\"items\":[{\"sku\":\"PAPA-YUNGAY\",\"name\":\"Papa Yungay\",\"qty\":\"10\",\"unit\":\"kg\",\"unitPrice\":\"2.50\"}],\"location\":{\"district\":\"Cajamarca\",\"gps\":\"-7.16,-78.5\"}}"
PAGAR
curl -sS -X POST "https://api-jjeai53xva-uc.a.run.app/sms/inbound" -H "Content-Type: application/x-www-form-urlencoded" --data "From=%2B519168568482&Body=PAGAR%2025.00%20PC-GUSTAVO-2025-001%20Compra%20en%20feria%20de%20Huambocancha"

EJEMPLO 2
INVITAR
curl -sS -X POST "https://api-jjeai53xva-uc.a.run.app/intents" -H "Content-Type: application/json" -d "{\"phone\":\"+519168568482\",\"amount\":\"21.00\",\"code\":\"PC-DANIEL-2025-001\",\"payerName\":\"María López\",\"payeeName\":\"Coop. Valle Verde\",\"payeePhone\":\"+51888888888\",\"currency\":\"PEN\",\"items\":[{\"sku\":\"ARROZ-SUP\",\"name\":\"Arroz Superior\",\"qty\":\"5\",\"unit\":\"kg\",\"unitPrice\":\"4.20\"}],\"location\":{\"district\":\"Cutervo\",\"gps\":\"-6.38,-78.81\"}}"
PAGAR
curl -sS -X POST "https://api-jjeai53xva-uc.a.run.app/sms/inbound" -H "Content-Type: application/x-www-form-urlencoded" --data "From=%2B519168568482&Body=PAGAR%2021.00%20PC-DANIEL-2025-001%20Entrega%20en%20plaza%20principal"

EJEMPLO 3
INVITAR
curl -sS -X POST "https://api-jjeai53xva-uc.a.run.app/intents" -H "Content-Type: application/json" -d "{\"phone\":\"+519168568482\",\"amount\":\"25.00\",\"code\":\"PC-GUSTAVO-2025-001\",\"payerName\":\"Juan Pérez\",\"toName\":\"Ana Quispe\",\"toPhone\":\"+51999999999\",\"currency\":\"PEN\",\"items\":[{\"sku\":\"PAPA-YUNGAY\",\"name\":\"Papa Yungay\",\"qty\":\"10\",\"unit\":\"kg\",\"unitPrice\":\"2.50\"}],\"location\":{\"district\":\"Cajamarca\",\"gps\":\"-7.16,-78.5\"},\"note\":\"Compra en feria de Huambocancha\"}"
PAGAR
curl -sS -X POST "https://api-jjeai53xva-uc.a.run.app/sms/inbound" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "From=+519168568482" --data-urlencode "Body=PAGAR 25.00 PC-GUSTAVO-2025-001 Compra en feria de Huambocancha"

EJEMPLO4
curl -sS -X POST "https://api-jjeai53xva-uc.a.run.app/intents" -H "Content-Type: application/json" -d "{\"phone\":\"+519168568482\",\"amount\":\"21.00\",\"code\":\"PC-DANIEL-2025-001\",\"payerName\":\"María López\",\"toName\":\"Coop. Valle Verde\",\"toPhone\":\"+51888888888\",\"currency\":\"PEN\",\"items\":[{\"sku\":\"ARROZ-SUP\",\"name\":\"Arroz Superior\",\"qty\":\"5\",\"unit\":\"kg\",\"unitPrice\":\"4.20\"}],\"location\":{\"district\":\"Cutervo\",\"gps\":\"-6.38,-78.81\"},\"note\":\"Entrega en plaza principal\"}"
PAGAR
curl -sS -X POST "https://api-jjeai53xva-uc.a.run.app/sms/inbound" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "From=+519168568482" --data-urlencode "Body=PAGAR 21.00 PC-DANIEL-2025-001 Entrega en plaza principal"

PRUEBA Filecoin

DESDE NUESTRO ENDPOINT
curl "https://api-jjeai53xva-uc.a.run.app/admin/filecoin/deals/bafkreiheg7vkd7rkxnwa5en6kvyqxginqaxmoh4h4a4ott6cax4eo6gxry"

DIRECTAMENTE DE Filecoin
curl "https://api.lighthouse.storage/api/lighthouse/deal_status?cid=bafkreigvk4ibspo2jxapcky7soorurqufz3wukjf2sloog7cjgvzqtl7mi"

curl "https://api.lighthouse.storage/api/lighthouse/deal_status?cid=bafkreiheg7vkd7rkxnwa5en6kvyqxginqaxmoh4h4a4ott6cax4eo6gxry"


https://filfox.info/en/deal/


UNLOCK prueba

node check-key.mjs --rpc https://polygon-rpc.com --contract 0x4bCA0a3fE8A7ABE4F47c713905538D4F14845558 --who 0x6E51a8a6A3243C7c569793C349CE3f235850ce92

