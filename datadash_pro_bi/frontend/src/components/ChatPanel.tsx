import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { MetricsResponse } from '../types';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface LlmAvailability {
  available: boolean;
  models: string[];
  recommended_model: string | null;
  error: string | null;
}

interface LlmAnswer {
  text: string;
  model_used: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'error';
  text: string;
  model?: string;
  timestamp: Date;
}

interface Props {
  data: MetricsResponse | null;
  centroSeleccionado?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Serializa solo las métricas relevantes para no sobrepasar el contexto del LLM */
function buildContext(data: MetricsResponse | null, centro: string): string {
  if (!data) return '{}';

  const metrics =
    centro && data.metrics.por_centro[centro]
      ? data.metrics.por_centro[centro]
      : data.metrics.global;

  const ctx = {
    archivo: data.filename,
    hoja_usada: data.sheet_used,
    total_registros: data.rows,
    centro_filtrado: centro || 'Todos',
    resumen: metrics.resumen,
    horas_por_area: metrics.horas_area.slice(0, 10),
    produccion_por_maquina: metrics.produccion_maquina.slice(0, 10),
    eficiencia_funcionarios: metrics.eficiencia_funcionarios.slice(0, 10),
    productivo_vs_improductivo: metrics.productivo_improductivo,
    eficiencia_maquina: metrics.eficiencia_maquina.slice(0, 10),
    ooe_mensual: metrics.ooe_mensual,
    centros_disponibles: data.metrics.centros,
  };

  return JSON.stringify(ctx, null, 0);
}

const SUGERENCIAS = [
  '¿Cuál es la eficiencia global del período?',
  '¿Qué máquina tiene más horas de uso?',
  '¿Cuántas órdenes de producción hay?',
  '¿Cuál es la distribución de tiempo productivo vs improductivo?',
  '¿Qué área tiene más horas registradas?',
  '¿Cuál es el OOE mensual más alto?',
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function ChatPanel({ data, centroSeleccionado = '' }: Props) {
  const [availability, setAvailability] = useState<LlmAvailability | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState(data != null);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const msgId = useRef(0);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setExpanded(data != null);
  }, [data]);

  const checkAvailability = async () => {
    setChecking(true);
    try {
      const raw = await invoke<string>('check_llm_availability');
      const av: LlmAvailability = JSON.parse(raw);
      setAvailability(av);
      if (av.recommended_model) setSelectedModel(av.recommended_model);
      if (av.available && messages.length === 0) {
        addMessage('assistant', `Ollama conectado. Modelos disponibles: ${av.models.join(', ')}. Pregúntame sobre los datos de producción.`);
      }
    } catch (e) {
      setAvailability({ available: false, models: [], recommended_model: null, error: String(e) });
    } finally {
      setChecking(false);
    }
  };

  const addMessage = (role: ChatMessage['role'], text: string, model?: string) => {
    setMessages(prev => [...prev, {
      id: ++msgId.current,
      role,
      text,
      model,
      timestamp: new Date(),
    }]);
  };

  const sendQuestion = async (question: string) => {
    if (!question.trim() || loading || !availability?.available) return;
    if (!data) {
      addMessage('error', 'Carga un archivo Excel primero para que pueda analizar los datos.');
      return;
    }

    const q = question.trim();
    setInput('');
    addMessage('user', q);
    setLoading(true);

    try {
      const contextJson = buildContext(data, centroSeleccionado);
      const raw = await invoke<string>('query_llm', {
        model: selectedModel || 'phi3',
        question: q,
        contextJson,
      });
      const answer: LlmAnswer = JSON.parse(raw);
      addMessage('assistant', answer.text, answer.model_used);
    } catch (e) {
      addMessage('error', String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(input);
    }
  };

  // ── Render: colapsado ────────────────────────────────────────────────────
  if (!expanded) {
    return (
      <div className="llm-collapsed" onClick={() => { setExpanded(true); if (!availability) checkAvailability(); }}>
        <span className="llm-collapsed__icon" aria-hidden>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </span>
        <span>Asistente IA</span>
        {availability?.available && <span className="llm-status llm-status--on" aria-label="LLM conectado" />}
      </div>
    );
  }

  // ── Render: expandido ────────────────────────────────────────────────────
  return (
    <div className="llm-panel">
      {/* Header */}
      <div className="llm-panel__header">
        <span className="llm-panel__title">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Asistente IA
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {availability?.available && (
            <select
              className="llm-model-select"
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              aria-label="Modelo LLM"
            >
              {availability.models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          <button className="btn btn--ghost btn--sm" onClick={() => setExpanded(false)} aria-label="Cerrar panel IA">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Estado Ollama */}
      {!availability && (
        <div className="llm-panel__connect">
          <p className="llm-panel__hint">
            Conecta con Ollama para hacer preguntas sobre los datos en lenguaje natural.
          </p>
          <button className="btn btn--primary btn--sm" onClick={checkAvailability} disabled={checking}>
            {checking ? 'Verificando…' : 'Conectar con Ollama'}
          </button>
        </div>
      )}

      {availability && !availability.available && (
        <div className="llm-panel__error">
          <p><strong>Ollama no disponible</strong></p>
          <p style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
            {availability.error}
          </p>
          <p style={{ fontSize: '11px', marginTop: '6px', opacity: 0.7 }}>
            Instala Ollama en <code>https://ollama.com</code> y ejecuta:<br />
            <code>ollama pull phi3</code>
          </p>
          <button className="btn btn--ghost btn--sm" style={{ marginTop: '8px' }} onClick={checkAvailability} disabled={checking}>
            {checking ? 'Verificando…' : 'Reintentar'}
          </button>
        </div>
      )}

      {/* Mensajes */}
      {availability?.available && (
        <>
          <div className="llm-panel__messages">
            {messages.length === 0 && (
              <div className="llm-panel__empty">
                <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '10px' }}>
                  Sugerencias:
                </p>
                {SUGERENCIAS.map(s => (
                  <button key={s} className="llm-suggestion" onClick={() => sendQuestion(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`llm-msg llm-msg--${msg.role}`}>
                {msg.role === 'assistant' && (
                  <span className="llm-msg__label">
                    {msg.model && <span className="llm-msg__model">{msg.model}</span>}
                  </span>
                )}
                <p className="llm-msg__text">{msg.text}</p>
                <span className="llm-msg__time">
                  {msg.timestamp.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {loading && (
              <div className="llm-msg llm-msg--assistant">
                <span className="llm-thinking">
                  <span /><span /><span />
                </span>
              </div>
            )}
            <div ref={msgEndRef} />
          </div>

          {/* Input */}
          <div className="llm-panel__input-row">
            <textarea
              className="llm-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={data ? 'Pregunta sobre los datos… (Enter para enviar)' : 'Carga un archivo primero'}
              disabled={loading || !data}
              rows={2}
              aria-label="Pregunta al asistente"
            />
            <button
              className="btn btn--primary btn--sm llm-send"
              onClick={() => sendQuestion(input)}
              disabled={loading || !input.trim() || !data}
              aria-label="Enviar pregunta"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>

          {messages.length > 0 && (
            <button
              className="btn btn--ghost btn--sm"
              style={{ fontSize: '10px', margin: '4px auto', display: 'block' }}
              onClick={() => setMessages([])}
            >
              Limpiar conversación
            </button>
          )}
        </>
      )}
    </div>
  );
}
