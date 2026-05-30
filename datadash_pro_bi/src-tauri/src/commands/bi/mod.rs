mod llm;

pub use llm::{
    check_llm_availability, get_ollama_url, list_llm_models,
    load_chat_history, query_llm, save_chat_history,
};

mod boletin;
mod excel;
mod metrics;
mod std_reference;

use boletin::{generate_boletin_pdf, generate_boletin_workbook, list_boletin_filters};
use excel::load_printux_excel;
use metrics::{compute_metrics_bundle, MetricsBundle};
use std_reference::parse_std_por_area_bytes;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Serialize)]
struct UploadResponse {
    filename: String,
    sheet_used: String,
    rows: usize,
    metrics: MetricsBundle,
}

/// Normaliza rutas del dialogo o arrastre en Windows (prefijo extendido, comillas).
pub(crate) fn normalize_user_path(raw: &str) -> PathBuf {
    let s = raw.trim().trim_matches('"');
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        if let Some(unc) = rest.strip_prefix("UNC\\") {
            let inner = unc.replace('/', "\\");
            return PathBuf::from(format!("\\\\{}", inner));
        }
        return PathBuf::from(rest);
    }
    PathBuf::from(s)
}

fn extension_ok(name: &str) -> bool {
    PathBuf::from(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| matches!(e.to_lowercase().as_str(), "xlsx" | "xls" | "xlsm"))
        .unwrap_or(false)
}

fn read_optional_std_bytes(path_opt: &Option<String>) -> Result<Option<Vec<u8>>, String> {
    let Some(raw) = path_opt.as_ref() else {
        return Ok(None);
    };
    let s = raw.trim();
    if s.is_empty() {
        return Ok(None);
    }
    let p = normalize_user_path(s);
    if !p.is_file() {
        return Err(format!(
            "Archivo STD POR AREA no encontrado o no es un archivo: {}",
            p.display()
        ));
    }
    let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if !extension_ok(fname) {
        return Err("STD POR AREA debe ser Excel (.xlsx, .xls, .xlsm).".to_string());
    }
    let bytes = fs::read(&p).map_err(|e| format!("No se pudo leer STD POR AREA: {e}"))?;
    Ok(Some(bytes))
}

const MAX_FILE_BYTES: usize = 100 * 1024 * 1024; // 100 MB

fn process_bytes(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("El archivo está vacío.".to_string());
    }
    if !extension_ok(&filename) {
        return Err("Solo archivos Excel (.xlsx, .xls, .xlsm)".to_string());
    }
    if bytes.len() > MAX_FILE_BYTES {
        return Err(format!(
            "El archivo es demasiado grande ({:.1} MB). El límite es {} MB.",
            bytes.len() as f64 / 1_048_576.0,
            MAX_FILE_BYTES / 1_048_576
        ));
    }

    let (df, sheet_used) = load_printux_excel(&bytes).map_err(|e| e.to_string())?;

    if df.height() == 0 {
        return Err("La hoja esta vacia o no tiene datos validos".to_string());
    }

    let metrics = compute_metrics_bundle(&df, Some(filename.as_str()));

    let resp = UploadResponse {
        filename,
        sheet_used,
        rows: df.height(),
        metrics,
    };

    serde_json::to_string(&resp).map_err(|e| e.to_string())
}

/// Procesa un Excel por ruta (arrastre desde el SO o diálogo que devuelve path).
#[tauri::command]
pub async fn upload_excel(_app: AppHandle, path: String) -> Result<String, String> {
    let path_buf = normalize_user_path(&path);

    tokio::task::spawn_blocking(move || {
        if !path_buf.exists() || !path_buf.is_file() {
            return Err(format!(
                "Archivo no encontrado o no accesible: {}",
                path_buf.display()
            ));
        }

        let filename = path_buf
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file.xlsx")
            .to_string();

        let bytes = fs::read(&path_buf).map_err(|e| format!("No se pudo leer el archivo: {e}"))?;

        process_bytes(filename, bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Procesa un Excel desde memoria (input file en el WebView; evita fallos por ruta).
#[tauri::command]
pub async fn upload_excel_bytes(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || process_bytes(filename, bytes))
        .await
        .map_err(|e| e.to_string())?
}

/// Carga y parsea **STD POR AREA.xlsx** (estándares por proceso / centro-actividad).
#[tauri::command]
pub async fn load_std_por_area(_app: AppHandle, path: String) -> Result<String, String> {
    let path_buf = normalize_user_path(&path);

    tokio::task::spawn_blocking(move || {
        let bytes = fs::read(&path_buf).map_err(|e| format!("No se pudo leer el archivo STD: {e}"))?;
        let parsed = parse_std_por_area_bytes(&bytes)?;
        serde_json::to_string(&parsed).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
struct BoletinFiltersJson {
    centros: Vec<String>,
    funcionarios_por_centro: std::collections::HashMap<String, Vec<String>>,
}

/// Centros y colaboradores disponibles en el archivo de producción (solo requiere la ruta del Excel cargado).
#[tauri::command]
pub async fn list_boletin_filters_cmd(production_path: String) -> Result<String, String> {
    let prod = normalize_user_path(&production_path);

    tokio::task::spawn_blocking(move || {
        let prod_bytes = fs::read(&prod).map_err(|e| format!("No se pudo leer producción: {e}"))?;
        let r = list_boletin_filters(&prod_bytes)?;
        let out = BoletinFiltersJson {
            centros: r.centros,
            funcionarios_por_centro: r.funcionarios_por_centro,
        };
        serde_json::to_string(&out).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Genera un .xlsx de boletín con plantilla incorporada (centro + colaborador + periodo).
#[tauri::command]
pub async fn generate_boletin_cmd(
    production_path: String,
    output_path: String,
    centro: String,
    funcionario: String,
    periodo: String,
    std_por_area_path: Option<String>,
) -> Result<(), String> {
    let prod = normalize_user_path(&production_path);
    let out = normalize_user_path(&output_path);
    let std_bytes = read_optional_std_bytes(&std_por_area_path)?;

    tokio::task::spawn_blocking(move || {
        let prod_bytes = fs::read(&prod).map_err(|e| format!("No se pudo leer producción: {e}"))?;
        generate_boletin_workbook(
            &prod_bytes,
            out.as_path(),
            &centro,
            &funcionario,
            &periodo,
            std_bytes.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Genera un PDF de boletín (misma información y esquema visual aproximado al INC).
#[tauri::command]
pub async fn generate_boletin_pdf_cmd(
    production_path: String,
    output_path: String,
    centro: String,
    funcionario: String,
    periodo: String,
    std_por_area_path: Option<String>,
) -> Result<(), String> {
    let prod = normalize_user_path(&production_path);
    let out = normalize_user_path(&output_path);
    let std_bytes = read_optional_std_bytes(&std_por_area_path)?;

    tokio::task::spawn_blocking(move || {
        let prod_bytes = fs::read(&prod).map_err(|e| format!("No se pudo leer producción: {e}"))?;
        generate_boletin_pdf(
            &prod_bytes,
            out.as_path(),
            &centro,
            &funcionario,
            &periodo,
            std_bytes.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
