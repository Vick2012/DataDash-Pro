//! Boletín por colaborador: maquetación INC integrada (sin archivo de plantilla externo).

use super::excel::load_printux_excel;
use super::std_reference::parse_std_por_area_bytes;
use edit_xlsx::WorkSheet;
use edit_xlsx::{Workbook, Write};
use polars::prelude::*;
use printpdf::{
    BuiltinFont, Color, Greyscale, IndirectFontRef, Mm, PdfDocument, PdfLayerReference, Rect, Rgb,
    path::{PaintMode, WindingOrder},
};
use printpdf::{Image as PdfImage, ImageTransform};
use image::codecs::jpeg::JpegDecoder;
use image::ImageDecoder;
use std::io::Cursor;

use serde::Serialize;
use std::collections::HashSet;
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

pub const BOLETIN_SHEET: &str = "Boletín";

/// STD POR AREA embebido en el binario — se usa cuando no se selecciona un archivo externo.
/// Para actualizar los estándares: reemplaza este archivo y recompila.
const STD_EMBEBIDO: &[u8] = include_bytes!("STD POR AREA.xlsx");

#[derive(Serialize)]
pub struct BoletinFilterResponse {
    pub centros: Vec<String>,
    pub funcionarios_por_centro: std::collections::HashMap<String, Vec<String>>,
}

pub fn list_boletin_filters(production_bytes: &[u8]) -> Result<BoletinFilterResponse, String> {
    let (df, _) = load_printux_excel(production_bytes)?;
    if df.column("funcionario").is_err() {
        return Err("Falta la columna funcionario para boletines.".to_string());
    }

    let has_centro = df.column("centro").is_ok();
    let mut por_centro: std::collections::HashMap<String, HashSet<String>> =
        std::collections::HashMap::new();

    let fcol = df.column("funcionario").map_err(|e| e.to_string())?;
    let fs = fcol.as_materialized_series();
    let c_utf = df
        .column("centro")
        .ok()
        .and_then(|c| c.as_materialized_series().str().ok());

    for i in 0..df.height() {
        let name = fs.get(i).unwrap_or_default().to_string();
        let name = name.trim_matches('"').trim().to_string();
        if name.is_empty() {
            continue;
        }
        let ckey = if has_centro {
            c_utf
                .as_ref()
                .and_then(|cs| cs.get(i))
                .map(|s| s.trim().to_string())
                .filter(|s: &String| !s.is_empty())
                .unwrap_or_else(|| "— Sin centro —".to_string())
        } else {
            "— Todo el archivo —".to_string()
        };
        por_centro.entry(ckey).or_default().insert(name);
    }

    let mut centros: Vec<String> = por_centro.keys().cloned().collect();
    centros.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));

    let funcionarios_por_centro: std::collections::HashMap<String, Vec<String>> = por_centro
        .into_iter()
        .map(|(c, set)| {
            let mut v: Vec<String> = set.into_iter().collect();
            v.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
            (c, v)
        })
        .collect();

    Ok(BoletinFilterResponse {
        centros,
        funcionarios_por_centro,
    })
}

#[derive(Clone, Default)]
struct ActividadRow {
    nombre: String,
    produccion: f64,
    horas: f64,
    pph: f64,
    estandar: f64,
    /// Porcentaje (0–100+): (prod/hora) / estándar × 100 si hay estándar > 0.
    eficiencia_pct: f64,
    /// false cuando no se cargó STD POR AREA — se muestra "—" en lugar de "0%"
    tiene_estandar: bool,
}

#[derive(Clone, Default)]
struct UsoTiempo {
    h_alist: f64,
    p_alist: f64,
    h_imp: f64,
    p_imp: f64,
    h_prod: f64,
    p_prod: f64,
    h_sin: f64,
    p_sin: f64,
    /// Eficiencia de tiempo: h_prod / total_horas × 100. Significativa sin STD POR AREA.
    eficiencia_tiempo_pct: f64,
}

fn bucket_filtro(f: &str) -> u8 {
    let u = f.to_uppercase();
    if u.contains("ALISTAMIENTO") {
        return 1;
    }
    if u.contains("SIN TRABAJO")
        || u.contains("SIN CLASIFICAR")
        || u.contains("SIN TRAB")
    {
        return 4;
    }
    if u.contains("IMPRODUCTIV") {
        return 2;
    }
    if u.contains("PRODUCTIV") {
        return 3;
    }
    2
}

/// Clasificación para **USO DEL TIEMPO**: combina columna `filtro` con el nombre de `actividad`.
/// En Printux muchas filas llegan como «Productiva» aunque la actividad sea espera, organización, montaje, etc.
pub(crate) fn bucket_uso_tiempo_row(filtro: &str, actividad: &str) -> u8 {
    let f = filtro.to_uppercase();
    let a = actividad.to_uppercase();

    if f.contains("ALISTAMIENTO") {
        return 1;
    }
    if f.contains("IMPRODUCTIV") {
        return 2;
    }
    if f.contains("SIN TRABAJO") || f.contains("SIN CLASIFICAR") || f.contains("SIN TRAB") {
        return 4;
    }

    if a.contains("SIN TRABAJO") || a.contains("SIN CLASIFICAR") {
        return 4;
    }

    let actividad_es_alistamiento = a.contains("ALISTAMIENTO")
        || a.contains("MONTAJE")
        || a.contains("PLANCHA")
        || a.contains("REGISTRO PLANCHA")
        || (a.contains("AJUSTE") && (a.contains("COLOR") || a.contains("TINTA")));
    if actividad_es_alistamiento {
        return 1;
    }

    let actividad_es_improductiva = a.contains("ESPERA")
        || a.contains("INSUMO")
        || a.contains("MATERIAL")
        || a.contains("ORGANIZAR")
        || a.contains("INICIO TURNO")
        || a.contains("FINAL TURNO")
        || a.contains("REUNI")
        || a.contains("PAUSA")
        || a.contains("RECESO")
        || a.contains("CAPACITAC")
        || a.contains("MANTENIMIENTO");
    if actividad_es_improductiva {
        return 2;
    }

    bucket_filtro(filtro)
}

fn norm_std_key(s: &str) -> String {
    s.to_uppercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Índice desde STD POR AREA: clave normalizada (centro/actividad en el libro) → unidades/h o estándar.
fn build_std_index(std_bytes: &[u8]) -> Result<Vec<(String, f64)>, String> {
    let resp = parse_std_por_area_bytes(std_bytes)?;
    let mut out: Vec<(String, f64)> = Vec::new();
    for e in resp.entries {
        let val = e
            .std_actualizado
            .or(e.std_actual)
            .or(e.std_produccion)
            .filter(|v| *v > 0.0);
        let Some(val) = val else { continue };
        let k1 = norm_std_key(&e.centro_actividad);
        if k1.len() >= 3 {
            out.push((k1, val));
        }
        if !e.proceso.trim().is_empty() {
            let k2 = norm_std_key(&format!("{} {}", e.proceso.trim(), e.centro_actividad.trim()));
            if k2.len() >= 4 && !out.iter().any(|(k, _)| k == &k2) {
                out.push((k2, val));
            }
        }
    }
    Ok(out)
}

/// Cruza nombre de actividad (y centro de costos) con filas del STD.
fn lookup_std_for_actividad(index: &[(String, f64)], actividad: &str, centro: &str) -> f64 {
    let na = norm_std_key(actividad);
    let nc = norm_std_key(centro);
    if na.is_empty() {
        return 0.0;
    }
    let mut best_score = 0usize;
    let mut best_val = 0.0_f64;
    for (k, val) in index {
        let mut score = 0usize;
        if !k.is_empty() && na.contains(k.as_str()) && k.len() >= 6 {
            score = score.max(k.len());
        }
        if !k.is_empty() && k.contains(&na) {
            score = score.max(na.len());
        }
        for w in na.split_whitespace() {
            if w.len() < 4 {
                continue;
            }
            if k.contains(w) {
                score += w.len();
            }
        }
        if !nc.is_empty() && k.contains(&nc) {
            score += 4;
        }
        if score > best_score {
            best_score = score;
            best_val = *val;
        }
    }
    if best_score >= 6 {
        best_val
    } else {
        0.0
    }
}

fn compute_block_data(
    df: &DataFrame,
    centro_costos_label: &str,
    std_index: Option<&[(String, f64)]>,
) -> Result<(String, Vec<ActividadRow>, UsoTiempo), String> {
    let trimmed = centro_costos_label.trim();
    let centro = if trimmed.is_empty() || trimmed == "— Todo el archivo —" {
        if df.column("centro").is_err() {
            String::new()
        } else {
            let out = df
                .clone()
                .lazy()
                .group_by([col("centro")])
                .agg([col("horas").sum().alias("h")])
                .sort_by_exprs([col("h")], Default::default())
                .reverse()
                .limit(1)
                .collect()
                .map_err(|e| e.to_string())?;
            if out.height() == 0 {
                String::new()
            } else {
                out.column("centro")
                    .map_err(|e| e.to_string())?
                    .get(0)
                    .map(|v| v.to_string().trim_matches('"').to_string())
                    .unwrap_or_default()
            }
        }
    } else {
        trimmed.to_string()
    };

    let mut actividades: Vec<ActividadRow> = Vec::new();
    if df.column("actividad").is_ok() && df.column("cantidad").is_ok() && df.column("horas").is_ok() {
        let agg = df
            .clone()
            .lazy()
            .group_by([col("actividad")])
            .agg([
                col("cantidad").sum().alias("cantidad"),
                col("horas").sum().alias("horas"),
            ])
            .collect()
            .map_err(|e| e.to_string())?;
        let n = agg.height();
        let names = agg
            .column("actividad")
            .map_err(|e| e.to_string())?
            .as_materialized_series();
        let cants = agg
            .column("cantidad")
            .map_err(|e| e.to_string())?
            .as_materialized_series()
            .f64()
            .map_err(|_| "cantidad".to_string())?;
        let hors = agg
            .column("horas")
            .map_err(|e| e.to_string())?
            .as_materialized_series()
            .f64()
            .map_err(|_| "horas".to_string())?;
        for i in 0..n {
            let nombre = names
                .get(i)
                .map(|v| v.to_string().trim_matches('"').to_string())
                .unwrap_or_default();
            if nombre.is_empty() {
                continue;
            }
            let produccion = cants.get(i).unwrap_or(0.0);
            let horas = hors.get(i).unwrap_or(0.0);
            let pph = if horas > 0.0 { produccion / horas } else { 0.0 };
            let estandar = std_index
                .map(|ix| lookup_std_for_actividad(ix, &nombre, &centro))
                .unwrap_or(0.0);
            let tiene_estandar = estandar > 0.0;
            let eficiencia_pct = if tiene_estandar {
                (pph / estandar) * 100.0
            } else {
                0.0
            };
            actividades.push(ActividadRow {
                nombre,
                produccion,
                horas,
                pph,
                estandar,
                eficiencia_pct,
                tiene_estandar,
            });
        }
        actividades.sort_by(|a, b| b.horas.partial_cmp(&a.horas).unwrap_or(std::cmp::Ordering::Equal));
    }

    let mut ut = UsoTiempo::default();
    if df.column("filtro").is_ok() && df.column("horas").is_ok() {
        let f = df.column("filtro").map_err(|e| e.to_string())?.as_materialized_series();
        let h = df.column("horas").map_err(|e| e.to_string())?.f64().map_err(|_| "horas".to_string())?;
        let act_utf = df
            .column("actividad")
            .ok()
            .and_then(|c| c.as_materialized_series().str().ok());
        let mut t_alist = 0.0f64;
        let mut t_imp = 0.0f64;
        let mut t_prod = 0.0f64;
        let mut t_sin = 0.0f64;
        for i in 0..df.height() {
            let hrs = h.get(i).unwrap_or(0.0);
            let fk = f.get(i).map(|v| v.to_string()).unwrap_or_default();
            let act = act_utf
                .as_ref()
                .and_then(|s| s.get(i))
                .unwrap_or("");
            match bucket_uso_tiempo_row(&fk, act) {
                1 => t_alist += hrs,
                2 => t_imp += hrs,
                3 => t_prod += hrs,
                4 => t_sin += hrs,
                _ => t_imp += hrs,
            }
        }
        let total = t_alist + t_imp + t_prod + t_sin;
        let safe_div = |x: f64| if total > 0.0 { x / total } else { 0.0 };
        ut.h_alist = t_alist;
        ut.p_alist = safe_div(t_alist);
        ut.h_imp = t_imp;
        ut.p_imp = safe_div(t_imp);
        ut.h_prod = t_prod;
        ut.p_prod = safe_div(t_prod);
        ut.h_sin = t_sin;
        ut.p_sin = safe_div(t_sin);
        let ps = ut.p_alist + ut.p_imp + ut.p_prod + ut.p_sin;
        if ps > 1e-9 && (ps - 1.0).abs() > 1e-5 {
            ut.p_alist /= ps;
            ut.p_imp /= ps;
            ut.p_prod /= ps;
            ut.p_sin /= ps;
        }
        // Eficiencia de tiempo: fracción de tiempo productivo sobre el total.
        // Útil cuando no se carga STD POR AREA.
        ut.eficiencia_tiempo_pct = if total > 0.0 { (t_prod / total) * 100.0 } else { 0.0 };
    }

    Ok((centro, actividades, ut))
}

fn filter_production_for_boletin(
    production_bytes: &[u8],
    centro_filtro: &str,
    funcionario: &str,
) -> Result<DataFrame, String> {
    let (df, _) = load_printux_excel(production_bytes)?;
    let fneedle = funcionario.trim().to_lowercase();
    // Filtra filas cuyo funcionario coincide de forma case-insensitive (sin depender de mayúsculas del Excel).
    let func_col = df
        .column("funcionario")
        .map_err(|e| e.to_string())?
        .as_materialized_series();
    let func_utf = func_col.str().map_err(|e| e.to_string())?;
    let func_idx: Vec<u32> = (0..df.height())
        .filter(|&i| {
            func_utf
                .get(i)
                .map(|s| s.trim().to_lowercase())
                .unwrap_or_default()
                == fneedle
        })
        .map(|i| i as u32)
        .collect();
    let mut sub = df
        .take(&UInt32Chunked::from_vec("i".into(), func_idx))
        .map_err(|e| e.to_string())?;
    if sub.height() == 0 {
        return Err(format!("No hay registros para el colaborador \"{funcionario}\"."));
    }

    let centro_needle = centro_filtro.trim();
    let filter_centro = df.column("centro").is_ok()
        && !centro_needle.is_empty()
        && centro_needle != "— Todo el archivo —";

    if filter_centro {
        let c_utf = sub
            .column("centro")
            .map_err(|e| e.to_string())?
            .as_materialized_series()
            .str()
            .map_err(|e| e.to_string())?;
        let needle_norm = centro_needle.trim().to_lowercase();
        let mut rows: Vec<u32> = Vec::new();
        for i in 0..sub.height() {
            // Comparación case-insensitive y sin espacios extra (incluyendo no-rompibles).
            let cv = c_utf
                .get(i)
                .map(|s| s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase())
                .unwrap_or_default();
            if cv == needle_norm {
                rows.push(i as u32);
            }
        }
        let idx = UInt32Chunked::from_vec("i".into(), rows);
        sub = sub.take(&idx).map_err(|e| e.to_string())?;
    }

    if sub.height() == 0 {
        return Err(
            "No hay registros de ese colaborador en el centro de producción seleccionado.".to_string(),
        );
    }

    Ok(sub)
}

/// Datos ya filtrados (mismos que el Excel) para reutilizar en PDF u otros formatos.
/// Si `std_bytes` es None usa el STD_EMBEBIDO en el binario; si falla el parseo, continúa sin estándar.
fn prepare_boletin(
    production_bytes: &[u8],
    centro_filtro: &str,
    funcionario: &str,
    std_bytes: Option<&[u8]>,
) -> Result<(String, Vec<ActividadRow>, UsoTiempo), String> {
    let sub = filter_production_for_boletin(production_bytes, centro_filtro, funcionario)?;

    // Prioridad: STD externo > STD embebido > sin estándar
    let effective_bytes = std_bytes.unwrap_or(STD_EMBEBIDO);
    let std_index = build_std_index(effective_bytes).ok();

    compute_block_data(&sub, centro_filtro, std_index.as_deref())
}

/// Textos fijos del formato tipo INC (periodo, funcionario, centro, EFICIENCIAS, USO DEL TIEMPO, nota pie).
fn write_boletin_layout_estatico(ws: &mut WorkSheet) -> Result<(), String> {
    let w = |ws: &mut WorkSheet, r: u32, col: u32, s: &str| -> Result<(), String> {
        ws.write_string((r, col), s.to_string()).map_err(|e| e.to_string())
    };

    let b = 2u32;
    w(ws, b, 2, "Periodo:")?;
    w(ws, b + 2, 2, "Funcionario:")?;
    w(ws, b + 3, 2, "Centro de costos:")?;

    w(ws, b + 4, 2, "EFICIENCIAS")?;
    let hdr = b + 5;
    w(ws, hdr, 2, "Actividad")?;
    w(ws, hdr, 3, "Producción")?;
    w(ws, hdr, 4, "Horas")?;
    w(ws, hdr, 5, "Producción / Hora")?;
    w(ws, hdr, 6, "Estándar")?;
    w(ws, hdr, 7, "EficienciaS")?;

    w(ws, b + 10, 2, "USO DEL TIEMPO")?;
    w(
        ws,
        b + 11,
        2,
        "T. Alistamiento | T. Improductivo | T. Productivo | Sin trabajo",
    )?;

    w(ws, b + 12, 2, "Funcionario")?;
    w(ws, b + 13, 2, "Centro de costos")?;

    let subh = b + 15;
    w(ws, subh, 2, "Horas Alist")?;
    w(ws, subh, 3, "% Alist")?;
    w(ws, subh, 4, "Horas Imp.")?;
    w(ws, subh, 5, "% Imp")?;
    w(ws, subh, 6, "Horas Prod.")?;
    w(ws, subh, 7, "% Prod.")?;
    w(ws, subh, 8, "Horas sin Trabajo")?;
    w(ws, subh, 9, "% Sin Tr.")?;

    let nota = b + 18;
    w(
        ws,
        nota,
        2,
        "El presente boletín refleja el registro de actividades en el sistema Printux. Una digitación correcta \
         permite la apropiada asignación de los costos y ofertas comerciales competitivas. Las observaciones a este \
         reporte deben dirigirse al jefe inmediato o al señor Camilo Anchique Rubiano.",
    )?;
    w(ws, nota + 1, 2, "SUBGERENCIA DE PRODUCCIÓN")?;

    Ok(())
}

fn workbook_boletin_vacio() -> Result<Workbook, String> {
    let mut wb = Workbook::new();
    let sid = wb
        .sheets
        .first()
        .map(|s| s.id())
        .ok_or_else(|| "No se pudo inicializar el libro Excel.".to_string())?;
    {
        let ws = wb
            .get_worksheet_mut(sid)
            .map_err(|e| e.to_string())?;
        ws.set_name(BOLETIN_SHEET).map_err(|e| e.to_string())?;
        write_boletin_layout_estatico(ws)?;
    }
    Ok(wb)
}

/// Rellena valores del boletín (columnas B–G actividades; tiempo B–I). `base` = fila «Periodo» (fila 2).
fn fill_first_block(
    ws: &mut WorkSheet,
    base: u32,
    periodo: &str,
    funcionario: &str,
    centro: &str,
    acts: &[ActividadRow],
    uso: &UsoTiempo,
) -> Result<(), String> {
    const PERIOD: u32 = 0;
    const FUNC_R: u32 = 2;
    const CENTRO_R: u32 = 3;
    const ACT0: u32 = 6;
    const NOM_OP: u32 = 12;
    const NOM_CENTRO: u32 = 13;
    const TIME_VAL: u32 = 16;

    let c = 3u32;
    ws.write_string((base + PERIOD, c), periodo.to_string())
        .map_err(|e| e.to_string())?;
    ws.write_string((base + FUNC_R, c), funcionario.to_string())
        .map_err(|e| e.to_string())?;
    ws.write_string((base + CENTRO_R, c), centro.to_string())
        .map_err(|e| e.to_string())?;

    for i in 0..4u32 {
        let r = base + ACT0 + i;
        if let Some(a) = acts.get(i as usize) {
            ws.write_string((r, 2), a.nombre.clone()).map_err(|e| e.to_string())?;
            let _ = ws.write_double((r, 3), a.produccion);
            let _ = ws.write_double((r, 4), a.horas);
            let _ = ws.write_double((r, 5), a.pph);
            let _ = ws.write_double((r, 6), a.estandar);
            if a.tiene_estandar {
                let _ = ws.write_double((r, 7), a.eficiencia_pct);
            } else {
                let _ = ws.write_string((r, 7), "—".to_string());
            }
        } else {
            let _ = ws.write_string((r, 2), String::new());
            for col in 3..=7 {
                let _ = ws.write_string((r, col), String::new());
            }
        }
    }

    ws.write_string((base + NOM_OP, c), funcionario.to_string())
        .map_err(|e| e.to_string())?;
    ws.write_string((base + NOM_CENTRO, c), centro.to_string())
        .map_err(|e| e.to_string())?;

    let _ = ws.write_double((base + TIME_VAL, 2), uso.h_alist);
    let _ = ws.write_double((base + TIME_VAL, 3), uso.p_alist * 100.0);
    let _ = ws.write_double((base + TIME_VAL, 4), uso.h_imp);
    let _ = ws.write_double((base + TIME_VAL, 5), uso.p_imp * 100.0);
    let _ = ws.write_double((base + TIME_VAL, 6), uso.h_prod);
    let _ = ws.write_double((base + TIME_VAL, 7), uso.p_prod * 100.0);
    let _ = ws.write_double((base + TIME_VAL, 8), uso.h_sin);
    let _ = ws.write_double((base + TIME_VAL, 9), uso.p_sin * 100.0);
    // Fila adicional: eficiencia de tiempo (% productivo sobre total)
    ws.write_string((base + TIME_VAL + 1, 2), "Eficiencia (% Tiempo Productivo):".to_string())
        .map_err(|e| e.to_string())?;
    let _ = ws.write_double((base + TIME_VAL + 1, 3), uso.eficiencia_tiempo_pct);

    Ok(())
}

pub fn generate_boletin_workbook(
    production_bytes: &[u8],
    output_path: &Path,
    centro_filtro: &str,
    funcionario: &str,
    periodo: &str,
    std_bytes: Option<&[u8]>,
) -> Result<(), String> {
    let (centro, acts, uso) = prepare_boletin(production_bytes, centro_filtro, funcionario, std_bytes)?;

    let mut wb = workbook_boletin_vacio()?;
    {
        let ws = wb
            .get_worksheet_mut_by_name(BOLETIN_SHEET)
            .map_err(|e| e.to_string())?;
        fill_first_block(ws, 2, periodo, funcionario, &centro, &acts, &uso)?;
    }
    wb.save_as(output_path)
        .map_err(|e| format!("Error al guardar el boletín: {e}"))?;
    Ok(())
}

const PDF_NOTA_LEGAL: &str = "El presente boletín refleja el registro de actividades en el sistema Printux (módulo minutos). Una digitación correcta \
permite la apropiada asignación de los costos y ofertas comerciales competitivas. Las observaciones a este \
reporte deben dirigirse al jefe inmediato o al señor Camilo Anchique Rubiano.";

fn pdf_baseline_from_top(page_h_mm: f32, dist_top_to_baseline_mm: f32) -> Mm {
    Mm(page_h_mm - dist_top_to_baseline_mm)
}

fn fmt_hours_es(n: f64) -> String {
    format!("{:.2}", n).replace('.', ",")
}

fn fmt_pct_es_ratio(ratio: f64) -> String {
    let x = ratio * 100.0;
    if x.abs() < 0.05 {
        return "0%".to_string();
    }
    if x.fract().abs() < 0.04 {
        format!("{:.0}%", x)
    } else {
        format!("{:.1}%", x).replace('.', ",")
    }
}

fn fmt_eficiencia_pct(p: f64) -> String {
    if p.abs() < 0.05 {
        return "0%".to_string();
    }
    if p.fract().abs() < 0.05 {
        format!("{:.0}%", p)
    } else {
        format!("{:.1}%", p).replace('.', ",")
    }
}

fn fmt_entero_miles(n: f64) -> String {
    let n = n.round() as i64;
    let neg = n < 0;
    let mut u = n.unsigned_abs();
    let mut groups: Vec<u32> = Vec::new();
    loop {
        groups.push((u % 1000) as u32);
        u /= 1000;
        if u == 0 {
            break;
        }
    }
    groups.reverse();
    let mut s = groups[0].to_string();
    for g in &groups[1..] {
        s.push('.');
        s.push_str(&format!("{g:03}"));
    }
    if neg {
        format!("-{s}")
    } else {
        s
    }
}

fn fmt_decimal_es(n: f64, dec: usize) -> String {
    format!("{:.*}", dec, n).replace('.', ",")
}

fn wrap_by_chars(text: &str, max_chars: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut cur = String::new();
    for w in text.split_whitespace() {
        let wlen = w.chars().count();
        let clen = cur.chars().count();
        if cur.is_empty() {
            cur = w.to_string();
        } else if clen + 1 + wlen <= max_chars {
            cur.push(' ');
            cur.push_str(w);
        } else {
            lines.push(cur);
            cur = w.to_string();
        }
    }
    if !cur.is_empty() {
        lines.push(cur);
    }
    lines
}

fn pdf_draw_cell(
    layer: &PdfLayerReference,
    page_h: f32,
    left_mm: f32,
    top_mm: f32,
    w_mm: f32,
    h_mm: f32,
    fill: Option<Rgb>,
) {
    let ll_y = page_h - top_mm - h_mm;
    let has_fill = fill.is_some();
    if let Some(rgb) = fill {
        layer.set_fill_color(Color::Rgb(rgb));
    }
    layer.set_outline_color(Color::Greyscale(Greyscale::new(0.25, None)));
    layer.set_outline_thickness(0.35);
    let mode = if has_fill {
        PaintMode::FillStroke
    } else {
        PaintMode::Stroke
    };
    let rect = Rect::new(
        Mm(left_mm),
        Mm(ll_y),
        Mm(left_mm + w_mm),
        Mm(ll_y + h_mm),
    )
    .with_mode(mode)
    .with_winding(WindingOrder::NonZero);
    layer.add_rect(rect);
}

/// Cabecera tipo plantilla INC: etiqueta con fondo azul claro, valor en celda blanca.
fn pdf_boletin_header_line(
    layer: &PdfLayerReference,
    font: &IndirectFontRef,
    page_h: f32,
    y_top: f32,
    row_h: f32,
    left: f32,
    label_w: f32,
    value_w: f32,
    label: &str,
    value: &str,
    label_bg: &Rgb,
) {
    let white_cell = Rgb::new(1.0, 1.0, 1.0, None);
    pdf_draw_cell(layer, page_h, left, y_top, label_w, row_h, Some(label_bg.clone()));
    pdf_draw_cell(
        layer,
        page_h,
        left + label_w,
        y_top,
        value_w,
        row_h,
        Some(white_cell),
    );
    let yb = pdf_baseline_from_top(page_h, y_top + row_h * 0.62);
    layer.set_fill_color(Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None)));
    layer.use_text(label, 8.5, Mm(left + 1.2), yb, font);
    layer.use_text(value, 8.5, Mm(left + label_w + 1.2), yb, font);
}

/// Misma información que el Excel, maquetación tipo boletín INC — **A4 apaisado** y actividad en varias líneas.
pub fn generate_boletin_pdf(
    production_bytes: &[u8],
    output_path: &Path,
    centro_filtro: &str,
    funcionario: &str,
    periodo: &str,
    std_bytes: Option<&[u8]>,
) -> Result<(), String> {
    let (centro, acts, uso) = prepare_boletin(production_bytes, centro_filtro, funcionario, std_bytes)?;

    // A4 horizontal: ancho × alto en mm
    // Título solo ASCII: metadatos PDF + visores (Edge) suelen mostrar UTF-8 como "BoletÃ­n".
    let (doc, page_idx, layer_idx) = PdfDocument::new("Boletin INC", Mm(297.0), Mm(210.0), "boletin");
    let font = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| format!("PDF (fuente): {e}"))?;
    let font_bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| format!("PDF (fuente): {e}"))?;

    let layer = doc.get_page(page_idx).get_layer(layer_idx);

    const PH: f32 = 210.0;
    const PW: f32 = 297.0;
    const M: f32 = 12.0;
    let table_w = PW - 2.0 * M;
    const HEADER_ROW_H: f32 = 5.4;
    const LABEL_COL_W: f32 = 42.0;

    // Colores plantilla INC (azul claro cabecera, teal oscuro en tablas — como Excel de referencia).
    let header_label_bg = Rgb::new(0.74, 0.86, 0.97, None);
    let teal_header = Rgb::new(0.09, 0.42, 0.46, None);
    let white = Rgb::new(1.0, 1.0, 1.0, None);
    let black = Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None));
    let white_c = Color::Rgb(white.clone());

// ── Logo INC ─────────────────────────────────────────────────────────
    {
        const LOGO_BYTES: &[u8] = include_bytes!("logo-inc.jpg");
        const LOGO_W_MM: f32 = 28.0;
        const LOGO_H_MM: f32 = 18.0;
        if let Ok(mut decoder) = JpegDecoder::new(Cursor::new(LOGO_BYTES as &[u8])) {
            let (px_w, _) = decoder.dimensions();
            let dpi = px_w as f32 * 25.4 / LOGO_W_MM;
            if let Ok(img) = PdfImage::try_from(decoder) {
                img.add_to_layer(
                    layer.clone(),
                    ImageTransform {
                        translate_x: Some(Mm(M)),
                        translate_y: Some(Mm(PH - 10.0 - LOGO_H_MM)),
                        dpi: Some(dpi),
                        ..Default::default()
                    },
                );
            }
        }
    }
    let mut y = 9.0_f32;

    const LOGO_AREA_W: f32 = 34.0;
    let header_left = M + LOGO_AREA_W;
    let val_w = table_w - LOGO_AREA_W - LABEL_COL_W;
    pdf_boletin_header_line(
        &layer,
        &font,
        PH,
        y,
        HEADER_ROW_H,
        header_left,
        LABEL_COL_W,
        val_w,
        "Periodo:",
        periodo,
        &header_label_bg,
    );
    y += HEADER_ROW_H;
    pdf_boletin_header_line(
        &layer,
        &font,
        PH,
        y,
        HEADER_ROW_H,
        header_left,
        LABEL_COL_W,
        val_w,
        "Funcionario:",
        funcionario,
        &header_label_bg,
    );
    y += HEADER_ROW_H;
    pdf_boletin_header_line(
        &layer,
        &font,
        PH,
        y,
        HEADER_ROW_H,
        header_left,
        LABEL_COL_W,
        val_w,
        "Centro de costos:",
        &centro,
        &header_label_bg,
    );
    y += HEADER_ROW_H + 3.5;

    layer.set_fill_color(black.clone());
    let y_title = y + 3.2;
    layer.use_text("EFICIENCIAS", 9.5, Mm(M), pdf_baseline_from_top(PH, y_title), &font_bold);
    y += 6.5;

    // Actividad más ancha para nombres largos (apaisado A4).
    let w0 = table_w * 0.43_f32;
    let w1 = table_w * 0.10_f32;
    let w2 = table_w * 0.09_f32;
    let w3 = table_w * 0.12_f32;
    let w4 = table_w * 0.11_f32;
    let w5 = table_w * 0.15_f32;

    let row_hdr_h = 6.5_f32;
    const MAX_ACT_LINES: usize = 5;
    const CHARS_PER_ACT_LINE: usize = 72;
    let x0 = M;

    pdf_draw_cell(&layer, PH, x0, y, w0, row_hdr_h, Some(teal_header.clone()));
    pdf_draw_cell(&layer, PH, x0 + w0, y, w1, row_hdr_h, Some(teal_header.clone()));
    pdf_draw_cell(&layer, PH, x0 + w0 + w1, y, w2, row_hdr_h, Some(teal_header.clone()));
    pdf_draw_cell(&layer, PH, x0 + w0 + w1 + w2, y, w3, row_hdr_h, Some(teal_header.clone()));
    pdf_draw_cell(&layer, PH, x0 + w0 + w1 + w2 + w3, y, w4, row_hdr_h, Some(teal_header.clone()));
    pdf_draw_cell(
        &layer,
        PH,
        x0 + w0 + w1 + w2 + w3 + w4,
        y,
        w5,
        row_hdr_h,
        Some(teal_header.clone()),
    );

    let y_txt = y + 4.2;
    let yb = pdf_baseline_from_top(PH, y_txt);
    layer.set_fill_color(white_c.clone());
    layer.use_text("Actividad", 7.0, Mm(x0 + 1.0), yb, &font_bold);
    layer.use_text("Producción", 7.0, Mm(x0 + w0 + 0.7), yb, &font_bold);
    layer.use_text("Horas", 7.0, Mm(x0 + w0 + w1 + 0.6), yb, &font_bold);
    layer.use_text("Producción / Hora", 6.6, Mm(x0 + w0 + w1 + w2 + 0.4), yb, &font_bold);
    layer.use_text("Estándar", 7.0, Mm(x0 + w0 + w1 + w2 + w3 + 0.5), yb, &font_bold);
    layer.use_text("EficienciaS", 6.9, Mm(x0 + w0 + w1 + w2 + w3 + w4 + 0.4), yb, &font_bold);

    y += row_hdr_h;
    for i in 0..4 {
        let row_y = y;
        let xc = x0;
        let row_h = if let Some(a) = acts.get(i as usize) {
            let mut lines = wrap_by_chars(&a.nombre, CHARS_PER_ACT_LINE);
            if lines.len() > MAX_ACT_LINES {
                lines.truncate(MAX_ACT_LINES);
                if let Some(last) = lines.last_mut() {
                    if last.chars().count() > 4 {
                        let keep = last.chars().count().saturating_sub(2);
                        last.truncate(
                            last.char_indices()
                                .nth(keep)
                                .map(|(i, _)| i)
                                .unwrap_or(last.len()),
                        );
                        last.push('…');
                    }
                }
            }
            (7.5_f32).max(4.0 + 2.95 * lines.len() as f32)
        } else {
            7.0_f32
        };

        pdf_draw_cell(&layer, PH, xc, row_y, w0, row_h, Some(white.clone()));
        pdf_draw_cell(&layer, PH, xc + w0, row_y, w1, row_h, Some(white.clone()));
        pdf_draw_cell(&layer, PH, xc + w0 + w1, row_y, w2, row_h, Some(white.clone()));
        pdf_draw_cell(&layer, PH, xc + w0 + w1 + w2, row_y, w3, row_h, Some(white.clone()));
        pdf_draw_cell(
            &layer,
            PH,
            xc + w0 + w1 + w2 + w3,
            row_y,
            w4,
            row_h,
            Some(white.clone()),
        );
        pdf_draw_cell(
            &layer,
            PH,
            xc + w0 + w1 + w2 + w3 + w4,
            row_y,
            w5,
            row_h,
            Some(white.clone()),
        );

        layer.set_fill_color(black.clone());
        if let Some(a) = acts.get(i as usize) {
            let lines = {
                let mut lines = wrap_by_chars(&a.nombre, CHARS_PER_ACT_LINE);
                if lines.len() > MAX_ACT_LINES {
                    lines.truncate(MAX_ACT_LINES);
                    if let Some(last) = lines.last_mut() {
                        if last.chars().count() > 4 {
                            let keep = last.chars().count().saturating_sub(2);
                            last.truncate(
                                last.char_indices()
                                    .nth(keep)
                                    .map(|(i, _)| i)
                                    .unwrap_or(last.len()),
                            );
                            last.push('…');
                        }
                    }
                }
                lines
            };
            for (li, line) in lines.iter().enumerate() {
                let yline = pdf_baseline_from_top(PH, row_y + 3.65 + li as f32 * 2.95);
                layer.use_text(line, 5.9, Mm(xc + 0.7), yline, &font);
            }
            let y_mid = pdf_baseline_from_top(PH, row_y + row_h * 0.58);
            layer.use_text(
                &fmt_entero_miles(a.produccion),
                6.5,
                Mm(xc + w0 + 0.7),
                y_mid,
                &font,
            );
            layer.use_text(&fmt_hours_es(a.horas), 6.5, Mm(xc + w0 + w1 + 0.6), y_mid, &font);
            layer.use_text(
                &fmt_decimal_es(a.pph, 3),
                6.5,
                Mm(xc + w0 + w1 + w2 + 0.6),
                y_mid,
                &font,
            );
            let est_txt = if a.estandar > 0.0 {
                format!("{:.0}", a.estandar)
            } else {
                "—".to_string()
            };
            layer.use_text(&est_txt, 6.5, Mm(xc + w0 + w1 + w2 + w3 + 0.6), y_mid, &font);
            let efic_txt = if a.tiene_estandar {
                fmt_eficiencia_pct(a.eficiencia_pct)
            } else {
                "—".to_string()
            };
            layer.use_text(
                &efic_txt,
                6.5,
                Mm(xc + w0 + w1 + w2 + w3 + w4 + 0.6),
                y_mid,
                &font,
            );
        }
        y += row_h;
    }

    y += 6.0;
    layer.set_fill_color(black.clone());
    layer.use_text(
        "USO DEL TIEMPO",
        10.0,
        Mm(M),
        pdf_baseline_from_top(PH, y + 3.8),
        &font_bold,
    );
    y += 8.0;

    let ncol = 8_usize;
    let cw = table_w / ncol as f32;
    let grp_h = 6.0_f32;
    let sub_h = 7.0_f32;
    let tdata_h = 6.0_f32;

    for g in 0..4 {
        let gx = M + g as f32 * cw * 2.0;
        pdf_draw_cell(&layer, PH, gx, y, cw * 2.0, grp_h, Some(white.clone()));
    }
    let gy = y + 4.35;
    let gyb = pdf_baseline_from_top(PH, gy);
    layer.set_fill_color(black.clone());
    // Centrado aproximado sobre cada pareja de columnas (como celdas combinadas).
    layer.use_text(
        "T. Alistamiento",
        6.9,
        Mm(M + cw - 16.5),
        gyb,
        &font_bold,
    );
    layer.use_text(
        "T. Improductivo",
        6.9,
        Mm(M + cw * 3.0 - 19.5),
        gyb,
        &font_bold,
    );
    layer.use_text(
        "T. Productivo",
        6.9,
        Mm(M + cw * 5.0 - 17.0),
        gyb,
        &font_bold,
    );
    layer.use_text("Sin trabajo", 6.9, Mm(M + cw * 7.0 - 12.5), gyb, &font_bold);

    y += grp_h;
    for c in 0..ncol {
        let cx = M + c as f32 * cw;
        pdf_draw_cell(&layer, PH, cx, y, cw, sub_h, Some(teal_header.clone()));
    }
    let sy = y + 4.6;
    let syb = pdf_baseline_from_top(PH, sy);
    layer.set_fill_color(white_c.clone());
    layer.use_text("Horas Alist", 6.35, Mm(M + 0.45), syb, &font_bold);
    layer.use_text("% Alist", 6.35, Mm(M + cw + 0.55), syb, &font_bold);
    layer.use_text("Horas Imp.", 6.35, Mm(M + cw * 2.0 + 0.4), syb, &font_bold);
    layer.use_text("% Imp", 6.35, Mm(M + cw * 3.0 + 0.55), syb, &font_bold);
    layer.use_text("Horas Prod.", 6.35, Mm(M + cw * 4.0 + 0.35), syb, &font_bold);
    layer.use_text("% Prod.", 6.35, Mm(M + cw * 5.0 + 0.5), syb, &font_bold);
    layer.use_text("Horas sin Trabajo", 5.85, Mm(M + cw * 6.0 + 0.25), syb, &font_bold);
    layer.use_text("% Sin Tr.", 6.35, Mm(M + cw * 7.0 + 0.4), syb, &font_bold);

    y += sub_h;
    for c in 0..ncol {
        let cx = M + c as f32 * cw;
        pdf_draw_cell(&layer, PH, cx, y, cw, tdata_h, Some(white.clone()));
    }
    let dy = y + 4.3;
    let dyb = pdf_baseline_from_top(PH, dy);
    layer.set_fill_color(black.clone());
    layer.use_text(&fmt_hours_es(uso.h_alist), 7.0, Mm(M + 0.8), dyb, &font);
    layer.use_text(&fmt_pct_es_ratio(uso.p_alist), 7.0, Mm(M + cw + 0.8), dyb, &font);
    layer.use_text(&fmt_hours_es(uso.h_imp), 7.0, Mm(M + cw * 2.0 + 0.8), dyb, &font);
    layer.use_text(&fmt_pct_es_ratio(uso.p_imp), 7.0, Mm(M + cw * 3.0 + 0.8), dyb, &font);
    layer.use_text(&fmt_hours_es(uso.h_prod), 7.0, Mm(M + cw * 4.0 + 0.8), dyb, &font);
    layer.use_text(&fmt_pct_es_ratio(uso.p_prod), 7.0, Mm(M + cw * 5.0 + 0.8), dyb, &font);
    layer.use_text(&fmt_hours_es(uso.h_sin), 7.0, Mm(M + cw * 6.0 + 0.8), dyb, &font);
    layer.use_text(&fmt_pct_es_ratio(uso.p_sin), 7.0, Mm(M + cw * 7.0 + 0.8), dyb, &font);

    y += tdata_h + 3.5;
    // Eficiencia de tiempo productivo (calculada sin necesidad de STD POR AREA)
    layer.set_fill_color(black.clone());
    let efic_label = format!(
        "Eficiencia (% Tiempo Productivo): {}",
        fmt_eficiencia_pct(uso.eficiencia_tiempo_pct)
    );
    layer.use_text(
        &efic_label,
        8.5,
        Mm(M),
        pdf_baseline_from_top(PH, y + 3.0),
        &font_bold,
    );
    y += 8.0;

    layer.set_fill_color(black.clone());
    for line in wrap_by_chars(PDF_NOTA_LEGAL, 118) {
        layer.use_text(&line, 8.0, Mm(M), pdf_baseline_from_top(PH, y), &font);
        y += 4.2;
    }
    y += 2.0;
    layer.use_text(
        "SUBGERENCIA DE PRODUCCIÓN",
        9.0,
        Mm(M),
        pdf_baseline_from_top(PH, y),
        &font_bold,
    );

    let file = File::create(output_path).map_err(|e| format!("No se pudo crear PDF: {e}"))?;
    let mut buf = BufWriter::new(file);
    doc.save(&mut buf)
        .map_err(|e| format!("Error al guardar PDF: {e}"))?;
    Ok(())
}
