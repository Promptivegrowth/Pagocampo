import { useCallback, useState } from 'react';

const BACKEND_URL = 'https://api-jjeai53xva-uc.a.run.app';

type StatusMsg = 'info' | 'success' | 'error';
type Page = 'home' | 'send' | 'pay' | 'inbox' | 'history';

interface Intent {
  code: string;
  amount: string;
  phone: string;
  status: string;
  timestamp: string;
  cid: string;
}

interface Message {
  id: number;
  from: string;
  text: string;
  time: string;
  status: 'received' | 'sent';
}

/** ---------- estilos compartidos (no cambia nada tu look) ---------- */
const styles = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #f3f4f6 0%, #ffffff 100%)', display: 'flex', flexDirection: 'column' as const },
  header: { background: 'linear-gradient(90deg, #16a34a 0%, #059669 50%, #0d9488 100%)', color: 'white', padding: '1rem', position: 'sticky' as const, top: 0, zIndex: 50, boxShadow: '0 10px 25px rgba(0,0,0,0.15)' },
  headerInner: { maxWidth: '28rem', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '1.5rem', fontWeight: '900', letterSpacing: '0.05em' },
  menuBtn: { background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '0.5rem', fontSize: '1.75rem' },
  nav: { borderTop: '1px solid rgba(255,255,255,0.2)', background: 'rgba(22, 163, 74, 0.5)', padding: '0.75rem', maxWidth: '28rem', margin: '0 auto', display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' },
  navBtn: { background: 'transparent', border: 'none', color: 'white', textAlign: 'left' as const, padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '1rem', fontWeight: '600', borderRadius: '0.5rem', transition: 'all 0.2s' },
  toast: (type: StatusMsg) => ({
    position: 'fixed' as const,
    top: '5rem',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 40,
    padding: '1rem',
    borderRadius: '0.75rem',
    fontSize: '0.875rem',
    fontWeight: '700',
    border: '2px solid',
    maxWidth: 'calc(100% - 2rem)',
    background: type === 'success' ? '#dcfce7' : type === 'error' ? '#fee2e2' : '#dbeafe',
    color: type === 'success' ? '#166534' : type === 'error' ? '#991b1b' : '#1e40af',
    borderColor: type === 'success' ? '#86efac' : type === 'error' ? '#fca5a5' : '#93c5fd',
  }),
  main: { flex: 1, padding: '1rem', maxWidth: '28rem', margin: '0 auto' },
  input: { width: '100%', padding: '0.75rem', border: '2px solid #d1d5db', borderRadius: '0.75rem', fontSize: '1rem', fontFamily: 'inherit', boxSizing: 'border-box' as const, transition: 'all 0.2s' },
  inputFocus: { outline: 'none', borderColor: '#3b82f6', boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.1)' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', marginBottom: '0.5rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  button: (bg: string) => ({ width: '100%', background: bg, color: 'white', border: 'none', padding: '1rem', borderRadius: '0.75rem', fontSize: '1rem', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 10px 15px rgba(0,0,0,0.1)' }),
  footer: { padding: '1rem', textAlign: 'center' as const, fontSize: '0.75rem', color: '#6b7280', borderTop: '1px solid #e5e7eb', background: 'rgba(255,255,255,0.5)' },
  card: { background: 'white', border: '2px solid #e5e7eb', padding: '1rem', borderRadius: '1rem', boxShadow: '0 4px 6px rgba(0,0,0,0.07)', marginBottom: '1rem' },
  homeCard: { background: 'linear-gradient(135deg, #16a34a 0%, #059669 100%)', color: 'white', padding: '1.5rem', borderRadius: '1rem', textAlign: 'center' as const, marginBottom: '1.5rem', boxShadow: '0 20px 25px rgba(0,0,0,0.15)' },
};

/** ---------- helpers compartidos ---------- */
const nowHM = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const sanitizePhone = (v: string) => v.replace(/[^\d+]/g, '').replace(/^00/, '+');
const sanitizeAmount = (v: string) => {
  // Mantengo tu sanitizado suave (no bloquea flujo)
  let s = v.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const parts = s.split('.');
  if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');
  const [ent, dec] = s.split('.');
  if (dec && dec.length > 2) s = ent + '.' + dec.slice(0, 2);
  return s;
};

/** ---------- páginas (FUERA del componente principal para no perder foco) ---------- */
function HomePage({ onGo }: { onGo: (p: Page) => void }) {
  return (
    <div>
      <div style={styles.homeCard}>
        <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🌾</div>
        <h2 style={{ fontSize: '2rem', fontWeight: '900', margin: '0 0 0.5rem 0' }}>PagoCampo</h2>
        <p style={{ fontSize: '0.875rem', opacity: 0.95, margin: 0 }}>Pagos por SMS para el campo</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { id: 'send', label: 'Enviar SMS', icon: '📱', bg: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' },
          { id: 'pay', label: 'Pagar', icon: '💳', bg: 'linear-gradient(135deg, #10b981 0%, #047857 100%)' },
          { id: 'inbox', label: 'Inbox', icon: '📧', bg: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)' },
          { id: 'history', label: 'Historial', icon: '📥', bg: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)' },
        ].map((btn: any) => (
          <button key={btn.id} onClick={() => onGo(btn.id)} style={{ ...styles.button(btn.bg), fontSize: '0.875rem', padding: '1.25rem 0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.75rem' }}>{btn.icon}</span>
            <span>{btn.label}</span>
          </button>
        ))}
      </div>

      <div style={{ ...styles.card, background: 'linear-gradient(135deg, #dcfce7 0%, #dbeafe 100%)', border: '2px solid #86efac' }}>
        <p style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: '700', margin: 0 }}>🔗 Twilio • Firebase • Filecoin • Polygon • Unlock</p>
      </div>
    </div>
  );
}

function SendPage(props: {
  phone: string; setPhone: (v: string) => void;
  payerName: string; setPayerName: (v: string) => void;
  amount: string; setAmount: (v: string) => void;
  toPhone: string; setToPhone: (v: string) => void;
  toName: string; setToName: (v: string) => void;
  note: string; setNote: (v: string) => void;
  code: string;
  onSend: () => void;
  loading: boolean;
}) {
  const { phone, setPhone, payerName, setPayerName, amount, setAmount, toPhone, setToPhone, toName, setToName, note, setNote, code, onSend, loading } = props;

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {[
          { label: 'Tu teléfono *', value: phone, onChange: (v: string) => setPhone(sanitizePhone(v)), placeholder: '+51912345678', type: 'tel' },
          { label: 'Tu nombre', value: payerName, onChange: (v: string) => setPayerName(v), placeholder: 'Juan', type: 'text' },
          { label: 'Monto (S/) *', value: amount, onChange: (v: string) => setAmount(sanitizeAmount(v)), placeholder: '35.50', type: 'text' },
          { label: 'Teléfono del receptor', value: toPhone, onChange: (v: string) => setToPhone(sanitizePhone(v)), placeholder: '+5199...', type: 'tel' },
          { label: 'Nombre del receptor', value: toName, onChange: (v: string) => setToName(v), placeholder: 'María', type: 'text' },
        ].map((field: any, i: number) => (
          <div key={i}>
            <label style={styles.label}>{field.label}</label>
            <input
              type={field.type}
              value={field.value}
              onChange={e => field.onChange(e.target.value)}
              placeholder={field.placeholder}
              onFocus={e => Object.assign(e.target.style, styles.inputFocus)}
              style={styles.input}
              onBlur={e => e.target.style.outline = 'none'}
            />
          </div>
        ))}
        <div>
          <label style={styles.label}>Nota / Concepto</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Concepto del pago..."
            style={{ ...styles.input, minHeight: '5rem', fontFamily: 'inherit' }}
            onFocus={e => Object.assign(e.target.style, styles.inputFocus)}
            onBlur={e => e.target.style.outline = 'none'}
          />
        </div>
      </div>

      <button onClick={onSend} disabled={loading} style={{ ...styles.button('linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)'), marginTop: '1.5rem', opacity: loading ? 0.6 : 1 }}>
        {loading ? '⏳ Enviando...' : '✉️ Enviar Invitación'}
      </button>

      {code && (
        <div style={{ ...styles.card, background: 'linear-gradient(135deg, #dcfce7 0%, #ecfdf5 100%)', border: '2px solid #86efac', marginTop: '1rem' }}>
          <p style={{ fontWeight: '700', fontSize: '0.875rem', color: '#166534', margin: '0 0 0.5rem 0' }}>✅ Invitación enviada</p>
          <p style={{ fontSize: '0.75rem', color: '#047857', margin: 0 }}>
            Clave: <code style={{ background: 'white', padding: '0.25rem 0.5rem', borderRadius: '0.375rem', fontFamily: 'monospace', fontWeight: '700', color: '#10b981' }}>{code}</code>
          </p>
        </div>
      )}
    </div>
  );
}

function PayPage(props: {
  code: string; setCode: (v: string) => void;
  amount: string; setAmount: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  onProcess: () => void;
  loading: boolean;
}) {
  const { code, setCode, amount, setAmount, phone, setPhone, onProcess, loading } = props;

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <div style={{ ...styles.card, background: 'linear-gradient(135deg, #fef3c7 0%, #fef08a 100%)', border: '2px solid #fcd34d' }}>
        <p style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: '700', margin: 0 }}>📝 Confirma aquí el pago cuando recibas el SMS del cliente.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
        {[
          { label: 'Clave (código) *', value: code, onChange: (v: string) => setCode(v.toUpperCase().replace(/[^\w-]/g, '')), placeholder: 'HACK00123' },
          { label: 'Monto (S/) *', value: amount, onChange: (v: string) => setAmount(sanitizeAmount(v)), placeholder: '35.50' },
          { label: 'Tu teléfono', value: phone, onChange: (v: string) => setPhone(sanitizePhone(v)), placeholder: '+5199...' },
        ].map((field: any, i: number) => (
          <div key={i}>
            <label style={styles.label}>{field.label}</label>
            <input
              value={field.value}
              onChange={e => field.onChange(e.target.value)}
              placeholder={field.placeholder}
              onFocus={e => Object.assign(e.target.style, styles.inputFocus)}
              style={styles.input}
              onBlur={e => e.target.style.outline = 'none'}
            />
          </div>
        ))}
      </div>

      {/* sin restricciones: solo bloquea cuando está cargando */}
      <button onClick={onProcess} disabled={loading} style={{ ...styles.button('linear-gradient(90deg, #10b981 0%, #047857 100%)'), marginTop: '1.5rem', opacity: loading ? 0.6 : 1 }}>
        {loading ? '⏳ Procesando...' : '💳 Confirmar Pago'}
      </button>
    </div>
  );
}

function InboxPage({ inbox }: { inbox: Message[] }) {
  return (
    <div style={{ paddingBottom: '2rem' }}>
      {inbox.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: '4rem', paddingBottom: '4rem', color: '#9ca3af' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem', opacity: 0.3 }}>📧</div>
          <p style={{ fontWeight: '600' }}>Sin mensajes</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {inbox.map(msg => (
            <div key={msg.id} style={{ ...styles.card, borderLeft: `4px solid ${msg.status === 'sent' ? '#3b82f6' : '#10b981'}`, background: msg.status === 'sent' ? 'linear-gradient(135deg, #eff6ff 0%, #eff6ff 100%)' : 'linear-gradient(135deg, #ecfdf5 0%, #ecfdf5 100%)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <p style={{ fontWeight: '700', fontSize: '0.875rem', color: '#1f2937', margin: 0 }}>{msg.from}</p>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', background: 'white', padding: '0.25rem 0.5rem', borderRadius: '0.375rem' }}>{msg.time}</span>
              </div>
              <p style={{ fontSize: '0.875rem', color: '#4b5563', margin: 0, wordBreak: 'break-word' }}>{msg.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryPage(props: {
  intents: Intent[];
  refreshing: boolean;
  onRefresh: () => void;
  onDownload: (code: string, cid: string) => void;
}) {
  const { intents, refreshing, onRefresh, onDownload } = props;

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <button onClick={onRefresh} disabled={refreshing} style={{ ...styles.button('linear-gradient(90deg, #d1d5db 0%, #b3b7ba 100%)'), marginBottom: '1rem', opacity: refreshing ? 0.6 : 1 }}>
        {refreshing ? '⏳ Actualizando...' : '🔄 Actualizar'}
      </button>

      {intents.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: '4rem', paddingBottom: '4rem', color: '#9ca3af' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem', opacity: 0.3 }}>📥</div>
          <p style={{ fontWeight: '600' }}>Sin transacciones</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {intents.map(intent => (
            <div key={intent.code} style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <p style={{ fontWeight: '900', fontSize: '0.875rem', fontFamily: 'monospace', color: '#1f2937', margin: '0 0 0.5rem 0' }}>{intent.code}</p>
                  <p style={{ fontSize: '1.125rem', fontWeight: '700', color: '#16a34a', margin: '0.5rem 0' }}>S/ {intent.amount}</p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.5rem 0 0 0' }}>{intent.phone}</p>
                </div>
                <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', borderRadius: '0.5rem', fontWeight: '700', background: intent.status === 'SUCCESS' ? '#dcfce7' : '#fef3c7', color: intent.status === 'SUCCESS' ? '#166534' : '#92400e' }}>
                  {intent.status}
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '1rem' }}>{intent.timestamp}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button onClick={() => onDownload(intent.code, intent.cid)} style={{ ...styles.button('linear-gradient(90deg, #f97316 0%, #c2410c 100%)'), fontSize: '0.875rem', padding: '0.75rem' }}>
                  📥 Descargar Recibo
                </button>
                <a href={`https://gateway.lighthouse.storage/ipfs/${intent.cid}`} target="_blank" rel="noopener noreferrer" style={{ ...styles.button('linear-gradient(90deg, #a855f7 0%, #7e22ce 100%)'), fontSize: '0.875rem', padding: '0.75rem', textDecoration: 'none' }}>
                  🔗 Ver en Filecoin
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** ---------- componente principal ---------- */
export default function PagoCampo() {
  const [page, setPage] = useState<Page>('home');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [payerName, setPayerName] = useState('');
  const [toPhone, setToPhone] = useState('');
  const [toName, setToName] = useState('');
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: StatusMsg } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [intents, setIntents] = useState<Intent[]>([
    { code: 'HACK001', amount: '35.50', phone: '+51916856848', status: 'SUCCESS', timestamp: '10:30 AM', cid: 'bafkreic3rdcs3w2v5ku5lyua4yeyh4bb2eijt5mhqrfbqfndogfqbshvpm' }
  ]);

  const [inbox, setInbox] = useState<Message[]>([
    { id: 1, from: '+51916856848', text: 'PAGAR 35.50 HACK001', time: '10:30 AM', status: 'received' },
    { id: 2, from: 'PagoCampo', text: 'Pago confirmado ✅', time: '10:31 AM', status: 'sent' }
  ]);

  const show = useCallback((text: string, type: StatusMsg = 'info') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  /** --- envío SIN restricciones bloqueantes --- */
  const sendInvitation = async () => {
    setLoading(true);
    try {
      const generatedCode = `HACK${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;

      const r = await fetch(`${BACKEND_URL}/intents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, amount, code: generatedCode, payerName: payerName || 'Usuario', toPhone: toPhone || null, toName: toName || null, note: note || null })
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.ok !== true) {
        throw new Error(data?.error || `HTTP ${r.status}`);
      }

      setCode(generatedCode);
      show(`✅ Invitación enviada. Clave: ${generatedCode}`, 'success');
      setInbox(prev => [...prev, { id: prev.length + 1, from: 'PagoCampo', text: `Invitación: PAGAR ${amount} ${generatedCode}`, time: nowHM(), status: 'sent' }]);

      // limpiamos opcionales; no tocamos amount/phone por si quiere reusar
      setPayerName('');
      setToName('');
      setToPhone('');
      setNote('');
    } catch (err: any) {
      show(`Error: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  /** --- proceso de pago SIN restricciones bloqueantes --- */
  const processPayment = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BACKEND_URL}/sms/inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ From: phone || '+51999999999', Body: `PAGAR ${amount} ${code}` })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      show(`✅ Pago procesado: ${code}`, 'success');
      setIntents(prev => [...prev, { code, amount, phone: phone || 'N/A', status: 'SENT_ON_CHAIN', timestamp: nowHM(), cid: 'bafkreic3rdcs3w2v5ku5lyua4yeyh4bb2eijt5mhqrfbqfndogfqbshvpm' }]);
      setInbox(prev => [...prev, { id: prev.length + 1, from: phone || 'Cliente', text: `PAGAR ${amount} ${code}`, time: nowHM(), status: 'received' }]);

      setCode('');
      setAmount('');
      setPhone('');
    } catch (err: any) {
      show(`Error: ${err?.message || err}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const downloadReceipt = async (intentCode: string, cid: string) => {
    try {
      show('Descargando recibo...', 'info');
      const url = `https://gateway.lighthouse.storage/ipfs/${cid}`;
      const res = await fetch(url);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `recibo-${intentCode}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      show('✅ Recibo descargado', 'success');
    } catch (err: any) {
      show(`Error: ${err?.message || err}`, 'error');
    }
  };

  const doRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      show('✅ Actualizado', 'success');
    }, 700);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <h1 style={styles.title}>🌾 PagoCampo</h1>
          <button onClick={() => setMenuOpen(v => !v)} style={styles.menuBtn}>
            {menuOpen ? '✕' : '≡'}
          </button>
        </div>

        {menuOpen && (
          <nav style={styles.nav}>
            {[
              { id: 'home', label: '🏠 Inicio' },
              { id: 'send', label: '📱 Enviar SMS' },
              { id: 'pay', label: '💳 Confirmar Pago' },
              { id: 'inbox', label: '📧 Inbox' },
              { id: 'history', label: '📥 Historial' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => { setPage(item.id as Page); setMenuOpen(false); }}
                style={{ ...styles.navBtn, background: page === (item.id as Page) ? 'rgba(255,255,255,0.25)' : 'transparent' }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {toast && <div style={styles.toast(toast.type)}>{toast.text}</div>}

      <main style={styles.main}>
        {page === 'home' && <HomePage onGo={setPage} />}
        {page === 'send' && (
          <SendPage
            phone={phone} setPhone={setPhone}
            payerName={payerName} setPayerName={setPayerName}
            amount={amount} setAmount={setAmount}
            toPhone={toPhone} setToPhone={setToPhone}
            toName={toName} setToName={setToName}
            note={note} setNote={setNote}
            code={code}
            onSend={sendInvitation}
            loading={loading}
          />
        )}
        {page === 'pay' && (
          <PayPage
            code={code} setCode={setCode}
            amount={amount} setAmount={setAmount}
            phone={phone} setPhone={setPhone}
            onProcess={processPayment}
            loading={loading}
          />
        )}
        {page === 'inbox' && <InboxPage inbox={inbox} />}
        {page === 'history' && (
          <HistoryPage
            intents={intents}
            refreshing={refreshing}
            onRefresh={doRefresh}
            onDownload={downloadReceipt}
          />
        )}
      </main>

      <footer style={styles.footer}>
        <p>PagoCampo v1.0 • Hackathon 2025</p>
      </footer>
    </div>
  );
}
