import { useState, useRef, useEffect, useCallback } from 'react';
import type { MetricsResponse } from '../types';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'error';
  text: string;
  streaming?: boolean;
  ts: Date;
}
interface Props {
  data: MetricsResponse | null;
  centroSeleccionado?: string;
}

const OLLAMA_URL = 'http://localhost:11434';
const SUGERENCIAS = [
  '¿Cuál es la eficiencia global del período?',
  '¿Qué máquina tiene más horas de uso?',
  '¿Cuántas órdenes de producción hay?',
  '¿Distribución de tiempo productivo vs improductivo?',
  '¿Qué área tiene más horas registradas?',
  '¿Cuál es el OEE mensual más alto?',
];

function buildCtx(data: MetricsResponse | null, centro: string) {
  if (!data) return '{}';
  const m = centro && data.metrics.por_centro?.[centro]
    ? data.metrics.por_centro[centro] : data.metrics.global;
  return JSON.stringify({
    archivo: data.filename, registros: data.rows,
    centro: centro || 'Todos',
    resumen: m.resumen,
    horas_area: m.horas_area?.slice(0, 8),
    produccion_maquina: m.produccion_maquina?.slice(0, 8),
    eficiencia_funcionarios: m.eficiencia_funcionarios?.slice(0, 8),
    productivo_improductivo: m.productivo_improductivo,
    eficiencia_maquina: m.eficiencia_maquina?.slice(0, 8),
    ooe_mensual: m.ooe_mensual,
    centros: data.metrics.centros,
  });
}

function buildPrompt(q: string, ctx: string) {
  return `Eres un asistente experto en análisis de producción industrial. Responde SIEMPRE en español. Usa los datos del contexto. NO inventes valores. Sé conciso y directo, máximo 3 párrafos.

DATOS:
${ctx}

Pregunta: ${q}`;
}

function fmt(d: Date) {
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatPanel({ data, centroSeleccionado = '' }: Props) {
  const [open, setOpen]           = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [models, setModels]       = useState<string[]>([]);
  const [model, setModel]         = useState('phi3');
  const [msgs, setMsgs]           = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showSug, setShowSug]     = useState(true);
  const abortRef  = useRef<AbortController | null>(null);
  const endRef    = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const idRef     = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  useEffect(() => {
    if (open && connected === null) check();
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const check = useCallback(async () => {
    try {
      const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error();
      const j = await r.json();
      const list: string[] = (j.models ?? []).map((m: { name: string }) => m.name);
      setModels(list);
      const pref = ['phi3','phi3:mini','llama3.2:3b','llama3.2','mistral','llama3'];
      const best = pref.find(p => list.some(m => m.startsWith(p))) ?? list[0] ?? 'phi3';
      setModel(best);
      setConnected(true);
    } catch { setConnected(false); }
  }, []);

  const addMsg = (role: ChatMessage['role'], text: string, streaming = false) => {
    const id = ++idRef.current;
    setMsgs(p => [...p, { id, role, text, streaming, ts: new Date() }]);
    return id;
  };
  const updMsg = (id: number, text: string, streaming = false) =>
    setMsgs(p => p.map(m => m.id === id ? { ...m, text, streaming } : m));

  const send = async (q: string) => {
    if (!q.trim() || streaming) return;
    setShowSug(false);
    setInput('');
    addMsg('user', q);
    setStreaming(true);
    const aid = addMsg('assistant', '', true);
    abortRef.current = new AbortController();
    try {
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          model, stream: true,
          prompt: buildPrompt(q, buildCtx(data, centroSeleccionado)),
          options: { temperature: 0.3, num_predict: 600 },
        }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.trim()) continue;
          try { const o = JSON.parse(line); if (o.response) { full += o.response; updMsg(aid, full, true); } } catch { /* skip */ }
        }
      }
      updMsg(aid, full || '(Sin respuesta)', false);
    } catch (e: unknown) {
      const ab = e instanceof Error && e.name === 'AbortError';
      updMsg(aid, ab ? '⏹ Generación detenida.' : `Error: ${String(e)}`, false);
    } finally { setStreaming(false); abortRef.current = null; }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const unreadDot = !open && msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant';

  return (
    <>
      {/* ── Botón flotante ── */}
      <button
        className={`ai-fab ${open ? 'ai-fab--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Cerrar asistente IA' : 'Abrir asistente IA'}
        title="Asistente IA de producción"
      >
        {open ? (
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeWidth="2.5" strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        ) : (
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.575 1.55M5 14.5l-1.575 1.55m0 0L5 17.6m-1.575-1.55L5 14.5"/>
          </svg>
        )}
        {connected === true && <span className="ai-fab__status" />}
        {unreadDot && <span className="ai-fab__badge" />}
      </button>

      {/* ── Ventana de chat ── */}
      <div className={`ai-window ${open ? 'ai-window--open' : ''}`} role="dialog" aria-label="Asistente IA de producción" aria-modal="false">

        {/* Header */}
        <div className="ai-win__header">
          <div className="ai-win__header-left">
            <div className="ai-win__avatar" aria-hidden>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082"/>
              </svg>
            </div>
            <div>
              <div className="ai-win__title">Asistente IA</div>
              <div className="ai-win__subtitle">
                {connected === true  ? <><span className="ai-online-dot"/>Online · {model}</> :
                 connected === false ? <><span className="ai-offline-dot"/>Sin conexión</> :
                 'Verificando…'}
              </div>
            </div>
          </div>
          <div className="ai-win__header-actions">
            {models.length > 1 && (
              <select className="ai-model-sel" value={model}
                onChange={e => setModel(e.target.value)} aria-label="Modelo LLM">
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            {connected === false && (
              <button className="ai-icon-btn" onClick={check} title="Reconectar" aria-label="Reconectar Ollama">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </button>
            )}
            {msgs.length > 0 && (
              <button className="ai-icon-btn" onClick={() => { setMsgs([]); setShowSug(true); }}
                title="Nueva conversación" aria-label="Limpiar chat">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Error Ollama */}
        {connected === false && (
          <div className="ai-banner ai-banner--err">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>
              <strong>Ollama no disponible</strong>
              <span> — Instala en ollama.com y ejecuta <code>ollama pull phi3</code></span>
            </div>
            <button className="ai-retry-btn" onClick={check}>Reintentar</button>
          </div>
        )}

        {/* Sin modelos */}
        {connected === true && models.length === 0 && (
          <div className="ai-banner ai-banner--warn">
            <span>Sin modelos instalados.</span>
            <code>ollama pull phi3</code>
          </div>
        )}

        {/* Cuerpo mensajes */}
        <div className="ai-body" role="log" aria-live="polite">

          {/* Bienvenida */}
          {msgs.length === 0 && (
            <div className="ai-welcome">
              <div className="ai-welcome__icon" aria-hidden>
                <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082"/>
                </svg>
              </div>
              <p className="ai-welcome__title">Hola, soy tu asistente de producción</p>
              <p className="ai-welcome__sub">
                {data
                  ? `Tengo acceso a los datos de "${data.filename}". Pregúntame lo que necesites.`
                  : 'Carga un archivo Excel para que pueda analizar los datos de producción.'}
              </p>

              {data && showSug && connected === true && models.length > 0 && (
                <div className="ai-sugs">
                  {SUGERENCIAS.map(s => (
                    <button key={s} className="ai-sug" onClick={() => send(s)} disabled={streaming}>
                      <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                      </svg>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mensajes */}
          {msgs.map(msg => (
            <div key={msg.id} className={`ai-msg ai-msg--${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="ai-msg__avatar" aria-hidden>
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15"/>
                  </svg>
                </div>
              )}
              <div className="ai-msg__content">
                <p className="ai-msg__text">
                  {msg.text || (msg.streaming ? '' : '…')}
                  {msg.streaming && msg.text && <span className="ai-cursor" aria-hidden>▋</span>}
                </p>
                {msg.streaming && msg.text === '' && (
                  <span className="ai-dots" aria-label="Generando">
                    <span/><span/><span/>
                  </span>
                )}
                <span className="ai-msg__time">{fmt(msg.ts)}</span>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Footer input */}
        <div className="ai-footer">
          <div className="ai-input-wrap">
            <textarea
              ref={inputRef}
              className="ai-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={
                connected === false ? 'Reconecta Ollama primero…' :
                !data               ? 'Carga un Excel primero…' :
                streaming           ? 'Generando…' :
                                      'Escribe una pregunta…'
              }
              disabled={!connected || !data || streaming}
              rows={1}
              style={{ resize: 'none' }}
              aria-label="Pregunta al asistente"
            />
            {streaming ? (
              <button className="ai-send-btn ai-send-btn--stop"
                onClick={() => abortRef.current?.abort()} aria-label="Detener">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>
              </button>
            ) : (
              <button className="ai-send-btn"
                onClick={() => send(input)}
                disabled={!input.trim() || !connected || !data}
                aria-label="Enviar">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </button>
            )}
          </div>
          <p className="ai-footer__note">100% local · sin internet · {model}</p>
        </div>
      </div>
    </>
  );
}
