//! Módulo LLM — Integración con Ollama (localhost:11434)
//! Comandos Tauri: check_llm_availability, query_llm, list_llm_models

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const OLLAMA_BASE: &str = "http://localhost:11434";
const TIMEOUT_SECS: u64 = 90;

// ── Modelos preferidos en orden de prioridad (menor a mayor consumo de RAM) ──
const PREFERRED_MODELS: &[(&str, u64)] = &[
    ("phi3",    4_096),   // Phi-3 Mini  → 4 GB RAM
    ("phi3:mini", 4_096),
    ("llama3.2:3b", 4_096), // Llama 3.2 3B → 4 GB RAM
    ("llama3.2", 4_096),
    ("mistral", 8_192),   // Mistral 7B  → 8 GB RAM
    ("llama3",  8_192),
];

// ── Tipos Ollama API ─────────────────────────────────────────────────────────

#[derive(Serialize)]
struct GenerateRequest<'a> {
    model: &'a str,
    prompt: String,
    stream: bool,
    options: GenerateOptions,
}

#[derive(Serialize)]
struct GenerateOptions {
    temperature: f32,
    num_predict: u32,
}

#[derive(Deserialize)]
struct GenerateResponse {
    response: String,
}

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<ModelInfo>,
}

#[derive(Deserialize)]
struct ModelInfo {
    name: String,
    size: Option<u64>,
}

// ── Tipos de respuesta al frontend ───────────────────────────────────────────

#[derive(Serialize)]
pub struct LlmAvailability {
    pub available: bool,
    pub models: Vec<String>,
    pub recommended_model: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct LlmAnswer {
    pub text: String,
    pub model_used: String,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn make_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())
}

/// Elige el mejor modelo disponible según los instalados en Ollama.
fn pick_model(available: &[String]) -> Option<String> {
    for (preferred, _ram_mb) in PREFERRED_MODELS {
        if let Some(found) = available.iter().find(|m| {
            m.to_lowercase().starts_with(&preferred.to_lowercase())
        }) {
            return Some(found.clone());
        }
    }
    // Si ninguno coincide, tomar el primero disponible
    available.first().cloned()
}

/// Construye el prompt de sistema + contexto de datos + pregunta del usuario.
fn build_prompt(question: &str, context_json: &str) -> String {
    format!(
        "Eres un asistente experto en análisis de producción industrial. \
        Tienes acceso a datos reales del sistema de producción de la empresa. \
        Responde SIEMPRE en español. \
        Usa los datos del contexto para responder con números y hechos concretos. \
        Si la información solicitada no está en el contexto, dilo claramente. \
        NO inventes valores ni porcentajes. \
        Sé conciso: máximo 4 párrafos.\n\
        \n\
        === CONTEXTO DE DATOS ACTUALES ===\n\
        {context_json}\n\
        === FIN DEL CONTEXTO ===\n\
        \n\
        Pregunta: {question}",
        context_json = context_json,
        question = question
    )
}

// ── Comandos Tauri ────────────────────────────────────────────────────────────

/// Verifica si Ollama está corriendo y lista los modelos disponibles.
#[tauri::command]
pub async fn check_llm_availability() -> Result<String, String> {
    let client = make_client()?;

    let result = client
        .get(format!("{OLLAMA_BASE}/api/tags"))
        .send()
        .await;

    let availability = match result {
        Err(e) => LlmAvailability {
            available: false,
            models: vec![],
            recommended_model: None,
            error: Some(format!(
                "Ollama no está disponible. Asegúrese de que esté instalado y ejecutándose. Error: {e}"
            )),
        },
        Ok(resp) => {
            if !resp.status().is_success() {
                return Ok(serde_json::to_string(&LlmAvailability {
                    available: false,
                    models: vec![],
                    recommended_model: None,
                    error: Some(format!("Ollama respondió con error: {}", resp.status())),
                })
                .unwrap_or_default());
            }

            let tags: TagsResponse = resp
                .json()
                .await
                .map_err(|e| format!("Error leyendo modelos: {e}"))?;

            let models: Vec<String> = tags.models.iter().map(|m| m.name.clone()).collect();
            let recommended = pick_model(&models);

            LlmAvailability {
                available: true,
                models,
                recommended_model: recommended,
                error: None,
            }
        }
    };

    serde_json::to_string(&availability).map_err(|e| e.to_string())
}

/// Lista los modelos instalados en Ollama (sin verificar disponibilidad completa).
#[tauri::command]
pub async fn list_llm_models() -> Result<String, String> {
    check_llm_availability().await
}

/// Envía una pregunta al LLM con el contexto de las métricas actuales.
/// - `model`: nombre del modelo Ollama a usar (p.ej. "phi3", "llama3.2:3b")
/// - `question`: pregunta en lenguaje natural del usuario
/// - `context_json`: JSON serializado del MetricsBundle actual (o subconjunto)
#[tauri::command]
pub async fn query_llm(
    model: String,
    question: String,
    context_json: String,
) -> Result<String, String> {
    if question.trim().is_empty() {
        return Err("La pregunta no puede estar vacía.".to_string());
    }
    if model.trim().is_empty() {
        return Err("Debe seleccionar un modelo LLM.".to_string());
    }

    let client = make_client()?;
    let prompt = build_prompt(&question, &context_json);

    let body = GenerateRequest {
        model: &model,
        prompt,
        stream: false,
        options: GenerateOptions {
            temperature: 0.3, // Respuestas más deterministas para datos numéricos
            num_predict: 512,
        },
    };

    let resp = client
        .post(format!("{OLLAMA_BASE}/api/generate"))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            format!(
                "No se pudo conectar con Ollama. Verifique que esté ejecutándose en localhost:11434. Error: {e}"
            )
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Error de Ollama ({status}): {body_text}. \
            Verifique que el modelo '{model}' esté instalado (ollama pull {model})."
        ));
    }

    let gen: GenerateResponse = resp
        .json()
        .await
        .map_err(|e| format!("Error interpretando respuesta de Ollama: {e}"))?;

    let answer = LlmAnswer {
        text: gen.response.trim().to_string(),
        model_used: model,
    };

    serde_json::to_string(&answer).map_err(|e| e.to_string())
}
