//! Lector Excel Printux / consolidados INC.
//! Hojas típicas: `Base` (consolidado), `gDatMinutas` (exporte crudo). Se intentan en ese orden.

use calamine::{open_workbook_auto_from_rs, Data, DataType, Reader};
use polars::frame::column::Column;
use polars::prelude::*;
use std::collections::HashMap;
use std::io::Cursor;
use chrono::NaiveDateTime;

/// Orden de preferencia para localizar la tabla analítica (no dashboards tipo "DASH …").
const SHEET_PRIORITY: &[&str] = &["Base", "gDatMinutas", "gdatminutas"];

const COLUMN_ALIASES: &[(&str, &[&str])] = &[
    ("op", &["OP", "op", "Orden producción", "OrdenProduccion"]),
    ("nomtrabajo", &["NomTrabajo", "nomtrabajo", "Trabajo"]),
    ("linea", &["Linea", "linea", "Producto"]),
    ("centro", &["Centro", "centro", "NomCentro", "nomcentro", "Máquina", "Maquina"]),
    ("area", &["Área", "area", "Area", "Área producción"]),
    ("actividad", &[
        "NomActividad",
        "nomactividad",
        "Actividad",
        "actividad",
        "Proceso",
    ]),
    ("funcionario", &[
        "Funcionario",
        "funcionario",
        "NomOperario",
        "nomoperario",
        "Operario",
        "operario",
        "Operador",
    ]),
    ("fecha", &["Fecha", "fecha"]),
    // No mapear Hora1/Hora2 aquí: suelen ser marcas de tiempo, no duración (rompe el cast a número).
    ("horas", &["Horas", "horas", "Duración", "Duracion", "duracion"]),
    ("hora1", &["Hora1", "hora1"]),
    ("hora2", &["Hora2", "hora2"]),
    ("cantidad", &[
        "Cantidad",
        "cantidad",
        "Unidades",
        "unidades",
        "Producción",
        "Produccion",
    ]),
    ("filtro", &["Tipo", "tipo", "FILTRO", "filtro", "Filter"]),
    ("mantenimiento", &["Mantenimiento", "mantenimiento"]),
    ("varadas", &["Varadas", "varadas", "Paradas"]),
];

fn data_to_string(d: &Data) -> String {
    // Excel guarda muchas fechas como `Data::DateTime` / ISO; sin esto la columna llega vacía
    // y el OOE mensual no puede agrupar por mes.
    match d {
        Data::DateTime(dt) => dt.as_f64().to_string(),
        Data::DateTimeIso(s) => s.trim().to_string(),
        Data::DurationIso(s) => s.trim().to_string(),
        _ => d
            .as_string()
            .or_else(|| d.as_f64().map(|n| n.to_string()))
            .unwrap_or_default()
            .trim()
            .to_string(),
    }
}

fn find_column(cols_lower: &HashMap<String, String>, aliases: &[&str]) -> Option<String> {
    for alias in aliases {
        let key = alias.to_lowercase().trim().to_string();
        if cols_lower.contains_key(&key) {
            return cols_lower.get(&key).cloned();
        }
        for (col_lower, col_orig) in cols_lower.iter() {
            if col_lower.contains(&key) || key.contains(col_lower) {
                return Some(col_orig.clone());
            }
        }
    }
    None
}

/// Reglas de clasificación: primer match gana. Cada entrada es (keywords, tipo).
/// Para agregar una categoría nueva basta con añadir una línea aquí.
const TIPO_REGLAS: &[(&[&str], &str)] = &[
    (&["SIN TRABAJO"], "Sin trabajo"),
    (&["MANTENIMIENTO"], "Mantenimiento"),
    (
        &[
            "ESPERA", "INSUMO", "MATERIAL", "ORGANIZAR",
            "INICIO TURNO", "FINAL TURNO",
            "REUNIÓN", "REUNION",
            "CAPACITACIÓN", "CAPACITACION",
            "SALUD OCUPACIONAL",
            "PAUSA", "RECESO",
            "IMPRODUCTIV",
        ],
        "Improductiva",
    ),
    (
        &["ALISTAMIENTO", "MONTAJE", "PLANCHA", "REGISTRO PLANCHA"],
        "Alistamiento",
    ),
];

fn infer_tipo_from_actividad(actividad: &str) -> &'static str {
    let u = actividad.to_uppercase();
    for (keywords, tipo) in TIPO_REGLAS {
        if keywords.iter().any(|k| u.contains(k)) {
            return tipo;
        }
    }
    // Regla compuesta: AJUSTE + COLOR/TINTA → Alistamiento
    if u.contains("AJUSTE") && (u.contains("COLOR") || u.contains("TINTA")) {
        return "Alistamiento";
    }
    "Productiva"
}

fn ensure_filtro_from_actividad(df: DataFrame) -> Result<DataFrame, String> {
    if df.column("filtro").is_ok() {
        return Ok(df);
    }
    if let Ok(act) = df.column("actividad") {
        if let Ok(ca) = act.as_materialized_series().str() {
            let labels: Vec<String> = (0..ca.len())
                .map(|i| infer_tipo_from_actividad(ca.get(i).unwrap_or("")).to_string())
                .collect();
            let filtro = Column::from(Series::new("filtro".into(), labels));
            return df.hstack(&[filtro]).map_err(|e| e.to_string());
        }
    }
    let n = df.height();
    let filtro = Column::from(Series::new(
        "filtro".into(),
        vec!["Sin clasificar".to_string(); n],
    ));
    df.hstack(&[filtro]).map_err(|e| e.to_string())
}

/// Diferencia en horas entre dos celdas (fecha/hora como texto o número serial tipo Excel).
fn hours_from_hora_cells(a: &str, b: &str) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    if let (Ok(d1), Ok(d2)) = (a.parse::<f64>(), b.parse::<f64>()) {
        if d1 > 20000.0 && d2 > 20000.0 {
            let diff = d2 - d1;
            if diff >= 0.0 && diff < 365.0 * 10.0 {
                return diff * 24.0;
            }
        }
    }
    let sa = a.replace('T', " ");
    let sb = b.replace('T', " ");
    let sa = sa.chars().take(32).collect::<String>();
    let sb = sb.chars().take(32).collect::<String>();
    for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"] {
        if let (Ok(t1), Ok(t2)) = (
            NaiveDateTime::parse_from_str(sa.trim(), fmt),
            NaiveDateTime::parse_from_str(sb.trim(), fmt),
        ) {
            let secs = (t2 - t1).num_seconds();
            if secs >= 0 {
                return secs as f64 / 3600.0;
            }
        }
    }
    0.0
}

/// Si no hay columna `Horas` pero sí `Hora1`/`Hora2`, calcula la duración en horas.
fn derive_horas_from_hora1_hora2(df: DataFrame) -> Result<DataFrame, String> {
    if df.column("horas").is_ok() {
        return Ok(df);
    }
    if df.column("hora1").is_err() || df.column("hora2").is_err() {
        return Ok(df);
    }
    let s1 = df.column("hora1").map_err(|e| e.to_string())?.as_materialized_series();
    let s2 = df.column("hora2").map_err(|e| e.to_string())?.as_materialized_series();
    let ca1 = s1.str().map_err(|e| e.to_string())?;
    let ca2 = s2.str().map_err(|e| e.to_string())?;
    let n = ca1.len();
    let mut v = Vec::with_capacity(n);
    for i in 0..n {
        v.push(hours_from_hora_cells(
            ca1.get(i).unwrap_or(""),
            ca2.get(i).unwrap_or(""),
        ));
    }
    let horas = Column::from(Series::new("horas".into(), v));
    df.hstack(&[horas]).map_err(|e| e.to_string())
}

fn normalize_columns(df: &DataFrame) -> Result<DataFrame, PolarsError> {
    let cols: Vec<_> = df.get_column_names().into_iter().map(|c| c.to_string()).collect();
    let cols_lower: HashMap<String, String> = cols
        .iter()
        .map(|c| (c.to_lowercase().trim().to_string(), c.clone()))
        .collect();

    let mut renames: Vec<(String, String)> = Vec::new();
    let mut used: Vec<String> = Vec::new();

    for (std_name, aliases) in COLUMN_ALIASES {
        if let Some(found) = find_column(&cols_lower, aliases) {
            if !used.iter().any(|u| u == &found) {
                renames.push((found.clone(), std_name.to_string()));
                used.push(found);
            }
        }
    }

    if renames.is_empty() {
        return Ok(df.clone());
    }

    let mut out = df.clone();
    for (from, to) in renames {
        let _ = out.rename(&from, to.as_str().into());
    }
    Ok(out)
}

fn dataframe_from_range(range: calamine::Range<Data>) -> Result<DataFrame, String> {
    let rows: Vec<Vec<Data>> = range.rows().map(|r| r.to_vec()).collect();
    if rows.is_empty() {
        return Err("La hoja está vacía".to_string());
    }

    let raw_headers: Vec<String> = rows[0]
        .iter()
        .enumerate()
        .map(|(i, d)| {
            let s = data_to_string(d);
            if s.is_empty() {
                format!("Columna_{}", i + 1)
            } else {
                s
            }
        })
        .collect();

    let headers: Vec<String> = {
        let mut counts: HashMap<String, usize> = HashMap::new();
        raw_headers
            .into_iter()
            .map(|name| {
                let count = counts.entry(name.clone()).or_insert(0);
                *count += 1;
                if *count == 1 {
                    name
                } else {
                    format!("{}_{}", name, count)
                }
            })
            .collect()
    };

    let num_cols = headers.len();
    let mut series_vec: Vec<Series> = Vec::with_capacity(num_cols);

    for col_idx in 0..num_cols {
        let mut str_values: Vec<Option<String>> = Vec::with_capacity(rows.len().saturating_sub(1));
        for row in rows.iter().skip(1) {
            let cell = row.get(col_idx).unwrap_or(&Data::Empty);
            let s = data_to_string(cell);
            str_values.push(if s.is_empty() { None } else { Some(s) });
        }
        series_vec.push(Series::new(headers[col_idx].as_str().into(), str_values));
    }

    let columns: Vec<_> = series_vec.into_iter().map(Column::from).collect();
    DataFrame::new_infer_height(columns).map_err(|e| e.to_string())
}

fn cast_numeric(df: DataFrame) -> Result<DataFrame, String> {
    let df = if df.column("horas").is_ok() {
        df.lazy()
            .with_column(
                col("horas")
                    .cast(polars::datatypes::DataType::Float64)
                    .fill_null(lit(0.0)),
            )
            .collect()
            .map_err(|e| e.to_string())?
    } else {
        df
    };

    let df = if df.column("cantidad").is_ok() {
        df.lazy()
            .with_column(
                col("cantidad")
                    .cast(polars::datatypes::DataType::Float64)
                    .fill_null(lit(0.0)),
            )
            .collect()
            .map_err(|e| e.to_string())?
    } else {
        df
    };

    Ok(df)
}

/// Abre el libro y elige la primera hoja prioritaria que tenga `horas` y centro o funcionario.
pub fn load_printux_excel(bytes: &[u8]) -> Result<(DataFrame, String), String> {
    let cursor = Cursor::new(bytes.to_vec());
    let mut workbook = open_workbook_auto_from_rs(cursor).map_err(|e| e.to_string())?;
    let sheet_names: Vec<String> = workbook.sheet_names().to_vec();

    let mut try_sheets: Vec<String> = Vec::new();
    for p in SHEET_PRIORITY {
        if let Some(s) = sheet_names.iter().find(|n| n.eq_ignore_ascii_case(p)) {
            try_sheets.push(s.clone());
        }
    }
    for s in &sheet_names {
        if !try_sheets.iter().any(|t| t.eq_ignore_ascii_case(s)) {
            let up = s.to_uppercase();
            if up.starts_with("DASH") || up == "INDEX" || (up == "HOJA1" && sheet_names.len() > 3) {
                continue;
            }
            try_sheets.push(s.clone());
        }
    }

    let mut last_err: Option<String> = None;
    for target in try_sheets {
        let range = match workbook.worksheet_range(&target) {
            Ok(r) => r,
            Err(e) => {
                last_err = Some(e.to_string());
                continue;
            }
        };
        let df_raw = match dataframe_from_range(range) {
            Ok(d) => d,
            Err(e) => {
                last_err = Some(e);
                continue;
            }
        };
        let df = match normalize_columns(&df_raw) {
            Ok(d) => d,
            Err(e) => {
                last_err = Some(e.to_string());
                continue;
            }
        };
        let df = match derive_horas_from_hora1_hora2(df) {
            Ok(d) => d,
            Err(e) => {
                last_err = Some(e);
                continue;
            }
        };
        let has_horas = df.column("horas").is_ok();
        let has_entity = df.column("centro").is_ok() || df.column("funcionario").is_ok();
        if !has_horas || !has_entity {
            last_err = Some(format!("Hoja \"{target}\": faltan Horas o Centro/Operario."));
            continue;
        }
        let df = match ensure_filtro_from_actividad(df) {
            Ok(d) => d,
            Err(e) => {
                last_err = Some(e);
                continue;
            }
        };
        let df = match cast_numeric(df) {
            Ok(d) => d,
            Err(e) => {
                last_err = Some(e);
                continue;
            }
        };
        if df.height() == 0 {
            continue;
        }
        return Ok((df, target));
    }

    Err(last_err.unwrap_or_else(|| {
        "No se encontró una hoja tabular con minutas (horas + centro u operario).".to_string()
    }))
}
