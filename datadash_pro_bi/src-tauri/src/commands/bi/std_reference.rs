//! Parser del libro **STD POR AREA.xlsx**: hoja maestra con estándares por proceso,
//! centro/actividad y unidades de producción (STD PRODUCCIÓN, STD ACTUAL, etc.).

use calamine::{open_workbook_auto_from_rs, Data, DataType, Reader};
use serde::Serialize;
use std::io::Cursor;

#[derive(Serialize, Clone, Debug)]
pub struct StdPorAreaEntry {
    pub proceso: String,
    pub centro_actividad: String,
    pub unidad: String,
    pub std_produccion: Option<f64>,
    pub std_actual: Option<f64>,
    pub std_actualizado: Option<f64>,
    pub observaciones: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct StdPorAreaResponse {
    pub source_sheet: String,
    pub entries: Vec<StdPorAreaEntry>,
}

fn data_to_f64(d: &Data) -> Option<f64> {
    d.as_f64()
}

fn data_to_string(d: &Data) -> String {
    d.to_string().trim().to_string()
}

struct ColMap {
    proceso: usize,
    centro: usize,
    unidad: usize,
    std_prod: usize,
    std_actual: usize,
    std_actualiz: usize,
    obs: Option<usize>,
}

fn detect_columns(header_row: &[Data]) -> Option<ColMap> {
    let mut proceso = None;
    let mut centro = None;
    let mut unidad = None;
    let mut std_prod = None;
    let mut std_actual = None;
    let mut std_actualiz = None;
    let mut obs = None;

    for (i, cell) in header_row.iter().enumerate() {
        let h = data_to_string(cell).to_lowercase().replace(['\n', '\r'], " ");
        let h = h.split_whitespace().collect::<Vec<_>>().join(" ");
        if h.is_empty() {
            continue;
        }
        if h.contains("observ") {
            obs = Some(i);
            continue;
        }
        if h.contains("centro") || h.contains("activ") {
            centro = Some(i);
            continue;
        }
        if h.contains("proceso") {
            proceso = Some(i);
            continue;
        }
        if h.contains("unidad") {
            unidad = Some(i);
            continue;
        }
        if h.contains("std") {
            if h.contains("actualiz") {
                std_actualiz = Some(i);
            } else if h.contains("produc") || h.contains("producci") {
                std_prod = Some(i);
            } else if h.contains("actual") {
                std_actual = Some(i);
            }
        }
    }

    if let (Some(p), Some(c), Some(u), Some(sp), Some(sa), Some(sz)) =
        (proceso, centro, unidad, std_prod, std_actual, std_actualiz)
    {
        return Some(ColMap {
            proceso: p,
            centro: c,
            unidad: u,
            std_prod: sp,
            std_actual: sa,
            std_actualiz: sz,
            obs,
        });
    }

    if header_row.len() >= 7 {
        Some(ColMap {
            proceso: 1,
            centro: 2,
            unidad: 3,
            std_prod: 4,
            std_actual: 5,
            std_actualiz: 6,
            obs: if header_row.len() > 7 { Some(7) } else { None },
        })
    } else {
        None
    }
}

fn get_cell(row: &[Data], idx: usize) -> &Data {
    row.get(idx).unwrap_or(&Data::Empty)
}

/// Interpreta el libro: prefiere **Hoja1**; si no existe, la primera hoja.
pub fn parse_std_por_area_bytes(bytes: &[u8]) -> Result<StdPorAreaResponse, String> {
    let mut wb = open_workbook_auto_from_rs(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let names = wb.sheet_names().to_vec();
    let sheet = names
        .iter()
        .find(|n| n.eq_ignore_ascii_case("Hoja1"))
        .or_else(|| names.first())
        .cloned()
        .ok_or_else(|| "El archivo no tiene hojas".to_string())?;

    let range = wb.worksheet_range(&sheet).map_err(|e| e.to_string())?;
    let height = range.height();
    let width = range.width();
    if height < 2 || width < 5 {
        return Err("Formato de STD no reconocido: pocas filas o columnas".to_string());
    }

    let header: Vec<Data> = (0..width)
        .map(|c| range.get((0, c)).cloned().unwrap_or(Data::Empty))
        .collect();

    let cols = detect_columns(&header).ok_or_else(|| {
        "No se encontraron columnas Proceso / Centro / Unidad / STD. Revise la primera fila.".to_string()
    })?;

    let mut entries = Vec::new();
    let mut last_proceso = String::new();

    for r in 1..height {
        let row: Vec<Data> = (0..width)
            .map(|c| range.get((r, c)).cloned().unwrap_or(Data::Empty))
            .collect();

        let p_raw = data_to_string(get_cell(&row, cols.proceso));
        if !p_raw.is_empty() {
            last_proceso = p_raw;
        }
        let centro = data_to_string(get_cell(&row, cols.centro));
        if centro.is_empty() {
            continue;
        }

        let unidad = data_to_string(get_cell(&row, cols.unidad));
        let obs = cols.obs.and_then(|i| {
            let s = data_to_string(get_cell(&row, i));
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        });

        entries.push(StdPorAreaEntry {
            proceso: last_proceso.clone(),
            centro_actividad: centro,
            unidad,
            std_produccion: data_to_f64(get_cell(&row, cols.std_prod)),
            std_actual: data_to_f64(get_cell(&row, cols.std_actual)),
            std_actualizado: data_to_f64(get_cell(&row, cols.std_actualiz)),
            observaciones: obs,
        });
    }

    if entries.is_empty() {
        return Err("No se leyeron filas de estándar (centro vacío en todas).".to_string());
    }

    Ok(StdPorAreaResponse {
        source_sheet: sheet,
        entries,
    })
}
