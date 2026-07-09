//! Métricas BI para datos Printux

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime};
use polars::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

use super::{boletin::bucket_uso_tiempo_row, std_reference::parse_std_por_area_bytes};

const STD_EMBEBIDO: &[u8] = include_bytes!("STD POR AREA.xlsx");

fn str_col(df: &DataFrame, name: &str) -> Option<Vec<String>> {
    let s = df.column(name).ok()?.as_materialized_series();
    Some(
        s.iter()
            .map(|v| v.to_string().replace('"', ""))
            .collect(),
    )
}

fn f64_col(df: &DataFrame, name: &str) -> Option<Vec<f64>> {
    let s = df.column(name).ok()?.as_materialized_series();
    let ca = s.f64().ok()?;
    Some((0..ca.len()).map(|i| ca.get(i).unwrap_or(0.0)).collect())
}

#[derive(Serialize, Deserialize)]
pub struct Resumen {
    pub total_horas: f64,
    pub total_produccion: i64,
    pub total_ordenes: i64,
    pub total_funcionarios: i64,
    pub total_maquinas: i64,
    pub ooe_global: f64,
}

#[derive(Serialize, Deserialize)]
pub struct ProduccionMaquina {
    pub maquina: String,
    pub horas: f64,
}

#[derive(Serialize, Deserialize)]
pub struct HorasArea {
    pub area: String,
    pub horas: f64,
}

#[derive(Serialize, Deserialize)]
pub struct EficienciaFuncionario {
    pub funcionario: String,
    pub horas: f64,
    pub produccion: i64,
    pub productividad: f64,
    pub std_promedio: f64,
    pub eficiencia_pct: f64,
    pub tiene_std: bool,
    pub h_alist: f64,
    pub p_alist: f64,
    pub h_imp: f64,
    pub p_imp: f64,
    pub h_prod: f64,
    pub p_prod: f64,
    pub h_sin: f64,
    pub p_sin: f64,
}

#[derive(Serialize, Deserialize)]
pub struct ProductivoImproductivo {
    pub tipo: String,
    pub horas: f64,
}

#[derive(Serialize, Deserialize)]
pub struct EficienciaMaquina {
    pub maquina: String,
    pub horas_uso: f64,
    pub mantenimiento: f64,
    pub varadas: f64,
    pub total: f64,
    pub mantenimiento_tipos: Vec<(String, f64)>,
    pub varadas_tipos: Vec<(String, f64)>,
}

#[derive(Serialize, Deserialize)]
pub struct OoeMensual {
    pub periodo: String,
    pub horas_productivas: f64,
    pub horas_totales: f64,
    pub ooe: f64,
}

fn norm_std_key(s: &str) -> String {
    s.to_uppercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

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

fn build_std_index(std_bytes: Option<&[u8]>) -> Option<Vec<(String, f64)>> {
    let bytes = std_bytes?;
    let resp = parse_std_por_area_bytes(bytes).ok()?;
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
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn build_activity_code_map() -> HashMap<String, String> {
    let mut map: HashMap<String, String> = HashMap::new();
    // compile-time CSV include so the binary contains the mapping file
    // Path is relative to this source file: ../../../data/activity_code_map.csv
    let csv = include_str!("../../../data/activity_code_map.csv");
    for (i, line) in csv.lines().enumerate() {
        if i == 0 {
            // skip header
            continue;
        }
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(2, ',');
        let code = parts.next().unwrap_or("").trim().trim_matches('"').to_string();
        let tipo = parts.next().unwrap_or("").trim().trim_matches('"').to_string();
        if !code.is_empty() {
            map.insert(code, tipo);
        }
    }
    map
}

fn actividad_tipo_label(actividad: &str, filtro: &str) -> Option<String> {
    let a = actividad.to_uppercase();
    let f = filtro.to_uppercase();

    // Mantenimiento específico
    if a.contains("MANT") || f.contains("MANT") {
        if a.contains("CORRECT") || a.contains("CORRECTIVO") || f.contains("CORRECT") {
            return Some("Mantenimiento - Correctivo".to_string());
        }
        if a.contains("PREVENT") || a.contains("PREVENTIVO") || f.contains("PREVENT") {
            return Some("Mantenimiento - Preventivo".to_string());
        }
        return Some("Mantenimiento - Otro".to_string());
    }

    // Paradas / varadas específicas
    if a.contains("PARAD") || a.contains("VARAD") || a.contains("PARO") || a.contains("PARADA") || f.contains("PARAD") || f.contains("VARAD") || f.contains("PARO") || f.contains("PARADA") {
        if a.contains("ELECT") || a.contains("ELÉCTR") || a.contains("ELECTR") || f.contains("ELECT") {
            return Some("Daño Eléctrico".to_string());
        }
        if a.contains("MECAN") || a.contains("MECÁN") || a.contains("FALLA") || f.contains("MECAN") {
            return Some("Daño Mecánico".to_string());
        }
        return Some("Parada / Varada - Otro".to_string());
    }

    // Fallbacks for daños detectados en actividad
    if a.contains("ELECT") || a.contains("ELÉCTR") || a.contains("ELECTR") {
        return Some("Daño Eléctrico".to_string());
    }
    if a.contains("MECAN") || a.contains("MECÁN") || a.contains("FALLA") {
        return Some("Daño Mecánico".to_string());
    }

    None
}

fn parse_year_month(fecha: &str) -> Option<(i32, u32)> {
    let s = fecha.trim();
    if s.is_empty() {
        return None;
    }
    let raw = s.replace('T', " ");
    let compact = raw.split('.').next().unwrap_or(&raw).trim();
    let date_formats = [
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%m/%d/%Y",
        "%m-%d-%Y",
    ];
    for fmt in date_formats {
        if let Ok(d) = NaiveDate::parse_from_str(compact, fmt) {
            return Some((d.year(), d.month()));
        }
    }
    let datetime_formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
    ];
    for fmt in datetime_formats {
        if let Ok(dt) = NaiveDateTime::parse_from_str(compact, fmt) {
            return Some((dt.year(), dt.month()));
        }
    }
    if let Ok(serial) = compact.parse::<f64>() {
        let days = serial.floor() as i64;
        if days > 20000 && days < 80000 {
            if let Some(base) = NaiveDate::from_ymd_opt(1899, 12, 30) {
                if let Some(date) = base.checked_add_signed(Duration::days(days)) {
                    return Some((date.year(), date.month()));
                }
            }
        }
    }
    None
}

/// Mes + año desde el nombre del archivo (p. ej. `Consolidado Minutas Marzo 2026.xlsx`).
fn parse_period_from_filename(name: &str) -> Option<(i32, u32)> {
    let lower = name.to_lowercase();
    const MONTHS: &[(&str, u32)] = &[
        ("enero", 1),
        ("febrero", 2),
        ("marzo", 3),
        ("abril", 4),
        ("mayo", 5),
        ("junio", 6),
        ("julio", 7),
        ("agosto", 8),
        ("septiembre", 9),
        ("setiembre", 9),
        ("octubre", 10),
        ("noviembre", 11),
        ("diciembre", 12),
    ];
    let mut month_num: Option<u32> = None;
    for (word, num) in MONTHS {
        if lower.contains(word) {
            month_num = Some(*num);
            break;
        }
    }
    let month = month_num?;

    let mut year: Option<i32> = None;
    for tok in lower.split(|c: char| !c.is_ascii_digit()) {
        if tok.len() == 4 {
            if let Ok(y) = tok.parse::<i32>() {
                if (1980..=2100).contains(&y) {
                    year = Some(y);
                    break;
                }
            }
        }
    }
    let y = year?;
    Some((y, month))
}

fn is_productive_label(filtro: &str) -> bool {
    let up = filtro.trim().to_uppercase();
    up == "PRODUCTIVA" || (up.contains("PRODUCTIVA") && !up.contains("IMPRODUCTIVA"))
}

fn compute_ooe(df: &DataFrame, file_hint: Option<&str>) -> (f64, Vec<OoeMensual>) {
    let Some(horas) = f64_col(df, "horas") else {
        return (0.0, vec![]);
    };
    if horas.is_empty() {
        return (0.0, vec![]);
    }

    let n = horas.len();
    let filtros = str_col(df, "filtro").unwrap_or_else(|| vec![String::new(); n]);
    let fechas = str_col(df, "fecha").unwrap_or_else(|| vec![String::new(); n]);

    let mut total_horas = 0.0;
    let mut productivas = 0.0;
    let mut monthly: BTreeMap<String, (f64, f64)> = BTreeMap::new();

    for i in 0..n {
        let h = horas.get(i).copied().unwrap_or(0.0).max(0.0);
        if h <= 0.0 {
            continue;
        }
        total_horas += h;
        let filtro = filtros.get(i).map_or("", |s| s.as_str());
        let prod = if is_productive_label(filtro) { h } else { 0.0 };
        productivas += prod;

        if let Some((y, m)) = fechas.get(i).and_then(|f| parse_year_month(f)) {
            let key = format!("{y:04}-{m:02}");
            let e = monthly.entry(key).or_insert((0.0, 0.0));
            e.0 += prod;
            e.1 += h;
        }
    }

    if monthly.is_empty() && total_horas > 0.0 {
        if let Some((y, m)) = file_hint.and_then(parse_period_from_filename) {
            monthly.insert(
                format!("{y:04}-{m:02}"),
                (productivas, total_horas),
            );
        }
    }

    let ooe_global = if total_horas > 0.0 {
        (productivas / total_horas) * 100.0
    } else {
        0.0
    };

    let ooe_mensual = monthly
        .into_iter()
        .map(|(periodo, (horas_productivas, horas_totales))| {
            let ooe = if horas_totales > 0.0 {
                (horas_productivas / horas_totales) * 100.0
            } else {
                0.0
            };
            OoeMensual {
                periodo,
                horas_productivas: (horas_productivas * 100.0).round() / 100.0,
                horas_totales: (horas_totales * 100.0).round() / 100.0,
                ooe: (ooe * 100.0).round() / 100.0,
            }
        })
        .collect();

    (((ooe_global * 100.0).round() / 100.0), ooe_mensual)
}

fn kpi_resumen(df: &DataFrame, ooe_global: f64) -> Resumen {
    let horas = df
        .column("horas")
        .ok()
        .and_then(|c| c.f64().ok())
        .map(|s| s.sum().unwrap_or(0.0))
        .unwrap_or(0.0);

    let cantidad = df
        .column("cantidad")
        .ok()
        .and_then(|c| c.f64().ok())
        .map(|s| s.sum().unwrap_or(0.0) as i64)
        .unwrap_or(0);

    let op_unique = df
        .column("op")
        .ok()
        .map(|c| c.n_unique().unwrap_or(0))
        .unwrap_or(0);

    let funcionarios = df
        .column("funcionario")
        .ok()
        .map(|c| c.n_unique().unwrap_or(0))
        .unwrap_or(0);

    let maquinas = df
        .column("centro")
        .ok()
        .map(|c| c.n_unique().unwrap_or(0))
        .unwrap_or(0);

    Resumen {
        total_horas: (horas * 100.0).round() / 100.0,
        total_produccion: cantidad,
        total_ordenes: op_unique as i64,
        total_funcionarios: funcionarios as i64,
        total_maquinas: maquinas as i64,
        ooe_global,
    }
}

fn produccion_por_maquina(df: &DataFrame, top_n: usize) -> Vec<ProduccionMaquina> {
    if df.column("centro").is_err() || df.column("horas").is_err() {
        return vec![];
    }

    let out = match df
        .clone()
        .lazy()
        .group_by([col("centro")])
        .agg([col("horas").sum().alias("horas")])
        .sort_by_exprs([col("horas")], Default::default())
        .reverse()
        .limit(top_n as u32)
        .collect()
    {
        Ok(o) => o,
        Err(_) => return vec![],
    };

    let maq = str_col(&out, "centro").unwrap_or_default();
    let hrs = f64_col(&out, "horas").unwrap_or_default();
    maq.into_iter()
        .zip(hrs.into_iter())
        .map(|(m, h)| ProduccionMaquina {
            maquina: m,
            horas: (h * 100.0).round() / 100.0,
        })
        .collect()
}

fn horas_por_area(df: &DataFrame, top_n: usize) -> Vec<HorasArea> {
    if df.column("area").is_err() || df.column("horas").is_err() {
        return vec![];
    }

    let out = match df
        .clone()
        .lazy()
        .group_by([col("area")])
        .agg([col("horas").sum().alias("horas")])
        .sort_by_exprs([col("horas")], Default::default())
        .reverse()
        .limit(top_n as u32)
        .collect()
    {
        Ok(o) => o,
        Err(_) => return vec![],
    };

    let area = str_col(&out, "area").unwrap_or_default();
    let hrs = f64_col(&out, "horas").unwrap_or_default();
    area.into_iter()
        .zip(hrs.into_iter())
        .map(|(a, h)| HorasArea {
            area: a,
            horas: (h * 100.0).round() / 100.0,
        })
        .collect()
}

fn eficiencia_funcionarios(df: &DataFrame, top_n: usize, std_index: Option<&[(String, f64)]>) -> Vec<EficienciaFuncionario> {
    if df.column("funcionario").is_err() {
        return vec![];
    }

    let has_horas = df.column("horas").is_ok();
    let has_cantidad = df.column("cantidad").is_ok();
    let has_actividad = df.column("actividad").is_ok();
    let has_filtro = df.column("filtro").is_ok();
    let has_centro = df.column("centro").is_ok();

    let mut usage_map: HashMap<String, [f64; 4]> = HashMap::new();
    if has_filtro && has_horas {
        let fcol = df.column("filtro").unwrap().as_materialized_series();
        let hcol = df.column("horas").unwrap().as_materialized_series().f64().unwrap();
        let act_col = df.column("actividad").ok().and_then(|c| c.as_materialized_series().str().ok());
        let func_col = df.column("funcionario").unwrap().as_materialized_series().str().ok();

        for i in 0..df.height() {
            let func = func_col
                .as_ref()
                .and_then(|s| s.get(i))
                .unwrap_or("")
                .trim_matches('"')
                .trim()
                .to_string();
            if func.is_empty() {
                continue;
            }
            let hrs = hcol.get(i).unwrap_or(0.0);
            if hrs <= 0.0 {
                continue;
            }
            let filtro = fcol.get(i).unwrap_or_default().to_string();
            let actividad = act_col
                .as_ref()
                .and_then(|s| s.get(i))
                .unwrap_or("")
                .to_string();
            let bucket = bucket_uso_tiempo_row(&filtro, &actividad);
            let entry = usage_map.entry(func).or_default();
            match bucket {
                1 => entry[0] += hrs,
                2 => entry[1] += hrs,
                3 => entry[2] += hrs,
                4 => entry[3] += hrs,
                _ => entry[1] += hrs,
            }
        }
    }

    let agg_horas = if has_horas {
        col("horas").sum().alias("horas")
    } else {
        col("cantidad").count().cast(DataType::Float64).alias("horas")
    };
    let agg_cantidad = if has_cantidad {
        col("cantidad").sum().alias("cantidad")
    } else {
        col("horas").count().cast(DataType::Float64).alias("cantidad")
    };

    let out = match df
        .clone()
        .lazy()
        .group_by([col("funcionario")])
        .agg([agg_horas, agg_cantidad])
        .with_column(
            (col("cantidad")
                / when(col("horas").eq(lit(0.0)))
                    .then(lit(1.0))
                    .otherwise(col("horas")))
            .alias("productividad"))
        .sort_by_exprs([col("horas")], Default::default())
        .reverse()
        .limit(top_n as u32)
        .collect()
    {
        Ok(o) => o,
        Err(_) => return vec![],
    };

    let func = str_col(&out, "funcionario").unwrap_or_default();
    let hrs = f64_col(&out, "horas").unwrap_or_default();
    let cant = f64_col(&out, "cantidad").unwrap_or_default();
    let prod = f64_col(&out, "productividad").unwrap_or_default();

    let mut std_map: HashMap<String, (f64, f64, f64)> = HashMap::new();
    if std_index.is_some() && has_actividad && has_centro && has_horas && has_cantidad {
        if let Ok(agg) = df
            .clone()
            .lazy()
            .group_by([col("funcionario"), col("centro"), col("actividad")])
            .agg([
                col("cantidad").sum().alias("cantidad"),
                col("horas").sum().alias("horas"),
            ])
            .collect()
        {
            let func_col = agg.column("funcionario").ok().and_then(|c| c.as_materialized_series().str().ok());
            let centro_col = agg.column("centro").ok().and_then(|c| c.as_materialized_series().str().ok());
            let act_col = agg.column("actividad").ok().and_then(|c| c.as_materialized_series().str().ok());
            let cantidad_col = agg.column("cantidad").ok().and_then(|c| c.as_materialized_series().f64().ok());
            let horas_col = agg.column("horas").ok().and_then(|c| c.as_materialized_series().f64().ok());
            if let (Some(func_col), Some(centro_col), Some(act_col), Some(cantidad_col), Some(horas_col)) = (
                func_col, centro_col, act_col, cantidad_col, horas_col,
            ) {
                for i in 0..agg.height() {
                    let funcionario = func_col.get(i).unwrap_or_default().trim_matches('"').trim().to_string();
                    if funcionario.is_empty() {
                        continue;
                    }
                    let centro = centro_col.get(i).unwrap_or_default().trim_matches('"').trim().to_string();
                    let actividad = act_col.get(i).unwrap_or_default().trim_matches('"').trim().to_string();
                    let cantidad = cantidad_col.get(i).unwrap_or(0.0);
                    let horas = horas_col.get(i).unwrap_or(0.0);
                    if horas <= 0.0 {
                        continue;
                    }
                    let pph = cantidad / horas;
                    let std = lookup_std_for_actividad(std_index.unwrap(), &actividad, &centro);
                    if std <= 0.0 {
                        continue;
                    }
                    let entry = std_map.entry(funcionario).or_insert((0.0, 0.0, 0.0));
                    entry.0 += horas * std;
                    entry.1 += horas * (pph / std);
                    entry.2 += horas;
                }
            }
        }
    }

    func.into_iter()
        .zip(hrs.into_iter())
        .zip(cant.into_iter().chain(std::iter::repeat(0.0)))
        .zip(prod.into_iter().chain(std::iter::repeat(0.0)))
        .map(|(((f, h), c), p)| {
            let totals = std_map.get(&f).cloned().unwrap_or((0.0, 0.0, 0.0));
            let std_promedio = if totals.2 > 0.0 { totals.0 / totals.2 } else { 0.0 };
            let eficiencia_pct = if totals.2 > 0.0 {
                (totals.1 / totals.2) * 100.0
            } else {
                0.0
            };
            let usage = usage_map.remove(&f).unwrap_or([0.0, 0.0, 0.0, 0.0]);
            EficienciaFuncionario {
                funcionario: f,
                horas: (h * 100.0).round() / 100.0,
                produccion: c as i64,
                productividad: (p * 100.0).round() / 100.0,
                std_promedio: (std_promedio * 100.0).round() / 100.0,
                eficiencia_pct: (eficiencia_pct * 100.0).round() / 100.0,
                tiene_std: totals.2 > 0.0,
                h_alist: (usage[0] * 100.0).round() / 100.0,
                p_alist: usage[0] / h.max(1.0),
                h_imp: (usage[1] * 100.0).round() / 100.0,
                p_imp: usage[1] / h.max(1.0),
                h_prod: (usage[2] * 100.0).round() / 100.0,
                p_prod: usage[2] / h.max(1.0),
                h_sin: (usage[3] * 100.0).round() / 100.0,
                p_sin: usage[3] / h.max(1.0),
            }
        })
        .collect()
}

fn productivo_vs_improductivo(df: &DataFrame) -> Vec<ProductivoImproductivo> {
    if df.column("filtro").is_err() || df.column("horas").is_err() {
        return vec![];
    }

    let out = match df
        .clone()
        .lazy()
        .group_by([col("filtro")])
        .agg([col("horas").sum().alias("horas")])
        .collect()
    {
        Ok(o) => o,
        Err(_) => return vec![],
    };

    let tipo = str_col(&out, "filtro").unwrap_or_default();
    let hrs = f64_col(&out, "horas").unwrap_or_default();
    tipo.into_iter()
        .zip(hrs.into_iter())
        .map(|(t, h)| ProductivoImproductivo {
            tipo: t,
            horas: (h * 100.0).round() / 100.0,
        })
        .collect()
}

fn eficiencia_maquina(df: &DataFrame, top_n: usize) -> Vec<EficienciaMaquina> {
    if df.column("centro").is_err() || df.column("horas").is_err() {
        return vec![];
    }

    let has_mant = df.column("mantenimiento").is_ok();
    let has_var = df.column("varadas").is_ok();
    use std::collections::HashMap as Map;
    let mut mant_by_machine: Map<String, Map<String, f64>> = Map::new();
    let mut var_by_machine: Map<String, Map<String, f64>> = Map::new();

    // Load code->tipo mapping (compile-time include). If the CSV contains
    // meaningful labels for activity codes, prefer those over heuristics.
    let activity_map: HashMap<String, String> = build_activity_code_map();

    // Build detailed tipo breakdowns from the raw rows regardless of whether
    // explicit `mantenimiento`/`varadas` columns exist. This ensures we return
    // `*_tipos` even when the Excel already contains those columns.
    {
        let act_opt = df
            .column("actividad")
            .ok()
            .and_then(|c| c.as_materialized_series().str().ok());
        let filt_opt = df
            .column("filtro")
            .ok()
            .and_then(|c| c.as_materialized_series().str().ok());
        let centro_col = df
            .column("centro")
            .ok()
            .and_then(|c| c.as_materialized_series().str().ok());

        let mant_col = df
            .column("mantenimiento")
            .ok()
            .and_then(|c| c.as_materialized_series().f64().ok());
        let var_col = df
            .column("varadas")
            .ok()
            .and_then(|c| c.as_materialized_series().f64().ok());
        let horas_col = df
            .column("horas")
            .ok()
            .and_then(|c| c.as_materialized_series().f64().ok());

        for i in 0..df.height() {
            let actividad = act_opt.as_ref().and_then(|s| s.get(i)).unwrap_or("");
            let filtro = filt_opt.as_ref().and_then(|s| s.get(i)).unwrap_or("");
            let centro = centro_col.as_ref().and_then(|s| s.get(i)).unwrap_or("").trim().to_string();
            if centro.is_empty() {
                continue;
            }

            let tipo = {
                let code = actividad.trim();
                if !code.is_empty() {
                    if let Some(mapped) = activity_map.get(code) {
                        if !mapped.trim().is_empty() && mapped.to_lowercase() != "sin asignar" {
                            mapped.clone()
                        } else {
                            actividad_tipo_label(actividad, filtro).unwrap_or_else(|| "Otros".to_string())
                        }
                    } else {
                        actividad_tipo_label(actividad, filtro).unwrap_or_else(|| "Otros".to_string())
                    }
                } else {
                    actividad_tipo_label(actividad, filtro).unwrap_or_else(|| "Otros".to_string())
                }
            };

            // Prefer explicit column values when present; otherwise fall back to `horas`
            let mant_h = mant_col.as_ref().map(|c| c.get(i).unwrap_or(0.0)).unwrap_or(0.0);
            let var_h = var_col.as_ref().map(|c| c.get(i).unwrap_or(0.0)).unwrap_or(0.0);
            if mant_h > 0.0 {
                let entry = mant_by_machine.entry(centro.clone()).or_default();
                *entry.entry(tipo.clone()).or_insert(0.0) += mant_h;
            } else if mant_col.is_none() {
                // If no explicit mantenimiento column, check if activity indicates maintenance
                let up_act = actividad.to_uppercase();
                let up_filt = filtro.to_uppercase();
                let is_mant = up_act.contains("MANTENIMIENTO") || up_filt.contains("MANTENIMIENTO");
                if is_mant {
                    let h = horas_col.as_ref().map(|c| c.get(i).unwrap_or(0.0)).unwrap_or(0.0);
                    if h > 0.0 {
                        let entry = mant_by_machine.entry(centro.clone()).or_default();
                        *entry.entry(tipo.clone()).or_insert(0.0) += h;
                    }
                }
            }

            if var_h > 0.0 {
                let entry = var_by_machine.entry(centro.clone()).or_default();
                *entry.entry(tipo.clone()).or_insert(0.0) += var_h;
            } else if var_col.is_none() {
                let up_act = actividad.to_uppercase();
                let up_filt = filtro.to_uppercase();
                let is_var = up_act.contains("PARAD")
                    || up_act.contains("VARAD")
                    || up_act.contains("PARO")
                    || up_act.contains("PARADA")
                    || up_filt.contains("PARAD")
                    || up_filt.contains("VARAD")
                    || up_filt.contains("PARO")
                    || up_filt.contains("PARADA");
                if is_var {
                    let h = horas_col.as_ref().map(|c| c.get(i).unwrap_or(0.0)).unwrap_or(0.0);
                    if h > 0.0 {
                        let entry = var_by_machine.entry(centro.clone()).or_default();
                        *entry.entry(tipo.clone()).or_insert(0.0) += h;
                    }
                }
            }
        }
    }

    let out = if has_mant && has_var {
        df.clone()
            .lazy()
            .with_column(col("horas").alias("horas_uso"))
            .with_column(
                col("mantenimiento")
                    .cast(DataType::Float64)
                    .fill_null(lit(0.0))
                    .alias("mantenimiento"),
            )
            .with_column(
                col("varadas")
                    .cast(DataType::Float64)
                    .fill_null(lit(0.0))
                    .alias("varadas"),
            )
            .group_by([col("centro")])
            .agg([
                col("horas_uso").sum().alias("horas_uso"),
                col("mantenimiento").sum().alias("mantenimiento"),
                col("varadas").sum().alias("varadas"),
            ])
    } else {
        // Si no hay columnas explícitas, derivamos `mantenimiento` y `varadas`
        // creando nuevas Series en memoria usando operaciones Rust sobre cadenas.
        let mut df_clone = df.clone();
        let n = df_clone.height();

        let act_opt = df_clone
            .column("actividad")
            .ok()
            .and_then(|c| c.as_materialized_series().str().ok());
        let filt_opt = df_clone
            .column("filtro")
            .ok()
            .and_then(|c| c.as_materialized_series().str().ok());
        let horas_opt = df_clone
            .column("horas")
            .ok()
            .and_then(|c| c.as_materialized_series().f64().ok());

        let mut mant_vals: Vec<f64> = Vec::with_capacity(n);
        let mut var_vals: Vec<f64> = Vec::with_capacity(n);

        // Also build detailed breakdowns by type per machine
        let centro_col = df_clone
            .column("centro")
            .ok()
            .and_then(|c| c.as_materialized_series().str().ok());

        
        for i in 0..n {
            let horas = horas_opt.as_ref().map(|h| h.get(i).unwrap_or(0.0)).unwrap_or(0.0);
            let actividad = act_opt.as_ref().and_then(|s| s.get(i)).unwrap_or("");
            let filtro = filt_opt.as_ref().and_then(|s| s.get(i)).unwrap_or("");
            let centro = centro_col.as_ref().and_then(|s| s.get(i)).unwrap_or("");
            let centro = centro.trim().to_string();

            let up_act = actividad.to_uppercase();
            let up_filt = filtro.to_uppercase();

            let is_mant = up_act.contains("MANTENIMIENTO") || up_filt.contains("MANTENIMIENTO");
            let is_var = up_act.contains("PARAD")
                || up_act.contains("VARAD")
                || up_act.contains("PARO")
                || up_act.contains("PARADA")
                || up_filt.contains("PARAD")
                || up_filt.contains("VARAD")
                || up_filt.contains("PARO")
                || up_filt.contains("PARADA");

            // classify into more specific types
            let tipo = {
                let code = actividad.trim();
                if !code.is_empty() {
                    if let Some(mapped) = activity_map.get(code) {
                        if !mapped.trim().is_empty() && mapped.to_lowercase() != "sin asignar" {
                            Some(mapped.clone())
                        } else {
                            actividad_tipo_label(actividad, filtro)
                        }
                    } else {
                        actividad_tipo_label(actividad, filtro)
                    }
                } else {
                    actividad_tipo_label(actividad, filtro)
                }
            };

            mant_vals.push(if is_mant { horas } else { 0.0 });
            var_vals.push(if is_var { horas } else { 0.0 });

            if is_mant {
                let t = tipo.clone().unwrap_or_else(|| "Mantenimiento - Otro".to_string());
                let entry = mant_by_machine.entry(centro.clone()).or_default();
                *entry.entry(t).or_insert(0.0) += horas;
            }
            if is_var {
                let t = tipo.clone().unwrap_or_else(|| "Parada / Varada - Otro".to_string());
                let entry = var_by_machine.entry(centro.clone()).or_default();
                *entry.entry(t).or_insert(0.0) += horas;
            }
        }

        let mant_series = Series::new("mantenimiento".into(), mant_vals);
        let var_series = Series::new("varadas".into(), var_vals);

        // Hacemos hstack y luego agrupamos como en el caso con columnas existentes.
        if let Ok(hs) = df_clone.hstack(&[Column::from(mant_series), Column::from(var_series)]) {
            df_clone = hs;
        }

        df_clone
            .lazy()
            .with_column(col("horas").alias("horas_uso"))
            .group_by([col("centro")])
            .agg([
                col("horas_uso").sum().alias("horas_uso"),
                col("mantenimiento").sum().alias("mantenimiento"),
                col("varadas").sum().alias("varadas"),
            ])
    };

    let out = match out
        .with_column(
            (col("horas_uso") + col("mantenimiento") + col("varadas")).alias("total"),
        )
        .sort_by_exprs([col("total")], Default::default())
        .reverse()
        .limit(top_n as u32)
        .collect()
    {
        Ok(o) => o,
        Err(_) => return vec![],
    };

    let maq = str_col(&out, "centro").unwrap_or_default();
    let uso = f64_col(&out, "horas_uso").unwrap_or_default();
    let mant = f64_col(&out, "mantenimiento").unwrap_or_default();
    let var = f64_col(&out, "varadas").unwrap_or_default();
    let total = f64_col(&out, "total").unwrap_or_default();

    maq.into_iter()
        .zip(uso.into_iter())
        .zip(mant.into_iter())
        .zip(var.into_iter())
        .zip(total.into_iter())
        .map(|((((m, u), ma), v), t)| {
            let mantenimiento_tipos = mant_by_machine
                .get(&m)
                .map(|mp| {
                    let mut v: Vec<(String, f64)> = mp
                        .iter()
                        .map(|(k, hrs)| (k.clone(), (hrs * 100.0).round() / 100.0))
                        .collect();
                    v.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                    v
                })
                .unwrap_or_default();

            let varadas_tipos = var_by_machine
                .get(&m)
                .map(|mp| {
                    let mut v: Vec<(String, f64)> = mp
                        .iter()
                        .map(|(k, hrs)| (k.clone(), (hrs * 100.0).round() / 100.0))
                        .collect();
                    v.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                    v
                })
                .unwrap_or_default();

            EficienciaMaquina {
                maquina: m,
                horas_uso: (u * 100.0).round() / 100.0,
                mantenimiento: (ma * 100.0).round() / 100.0,
                varadas: (v * 100.0).round() / 100.0,
                total: (t * 100.0).round() / 100.0,
                mantenimiento_tipos,
                varadas_tipos,
            }
        })
        .collect()
}

#[derive(Serialize, Deserialize)]
pub struct AllMetrics {
    pub resumen: Resumen,
    pub produccion_maquina: Vec<ProduccionMaquina>,
    pub horas_area: Vec<HorasArea>,
    pub eficiencia_funcionarios: Vec<EficienciaFuncionario>,
    pub productivo_improductivo: Vec<ProductivoImproductivo>,
    pub uso_maquinas: Vec<ProduccionMaquina>,
    pub eficiencia_maquina: Vec<EficienciaMaquina>,
    pub ooe_mensual: Vec<OoeMensual>,
}

/// Respuesta agrupada: vista global y un bloque de métricas por cada centro de producción (columna `centro`).
#[derive(Serialize, Deserialize)]
pub struct MetricsBundle {
    pub global: AllMetrics,
    pub centros: Vec<String>,
    pub por_centro: BTreeMap<String, AllMetrics>,
}

/// Lista única de centros (ordenada), a partir de la columna `centro`.
pub fn list_centros(df: &DataFrame) -> Vec<String> {
    let Ok(c) = df.column("centro") else {
        return vec![];
    };
    let Ok(casted) = c.cast(&DataType::String) else {
        return vec![];
    };
    let Ok(u) = casted.unique() else {
        return vec![];
    };
    let Ok(ca) = u.str() else {
        return vec![];
    };
    let mut names: Vec<String> = (0..ca.len())
        .filter_map(|i| ca.get(i))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    names.sort();
    names.dedup();
    names
}

fn filter_df_by_centro(df: &DataFrame, centro: &str) -> Option<DataFrame> {
    if df.column("centro").is_err() {
        return None;
    }
    let out = df
        .clone()
        .lazy()
        .filter(col("centro").cast(DataType::String).eq(lit(centro)))
        .collect()
        .ok()?;
    if out.height() == 0 {
        None
    } else {
        Some(out)
    }
}

pub fn compute_all_metrics(df: &DataFrame, file_hint: Option<&str>, std_index: Option<&[(String, f64)]>) -> AllMetrics {
    let (ooe_global, ooe_mensual) = compute_ooe(df, file_hint);
    AllMetrics {
        resumen: kpi_resumen(df, ooe_global),
        produccion_maquina: produccion_por_maquina(df, 15),
        horas_area: horas_por_area(df, 15),
        eficiencia_funcionarios: eficiencia_funcionarios(df, 20, std_index),
        productivo_improductivo: productivo_vs_improductivo(df),
        uso_maquinas: produccion_por_maquina(df, 15),
        eficiencia_maquina: eficiencia_maquina(df, 20),
        ooe_mensual,
    }
}

pub fn compute_metrics_bundle(df: &DataFrame, file_hint: Option<&str>, std_bytes: Option<&[u8]>) -> MetricsBundle {
    let effective_bytes = std_bytes.or(Some(STD_EMBEBIDO));
    let std_index = build_std_index(effective_bytes);
    let std_ref = std_index.as_deref();
    MetricsBundle {
        global: compute_all_metrics(df, file_hint, std_ref),
        centros: list_centros(df),
        por_centro: df
            .clone()
            .lazy()
            .group_by([col("centro")])
            .agg([col("centro").count().alias("count")])
            .collect()
            .ok()
            .map(|centros| {
                centros
                    .column("centro")
                    .ok()
                    .and_then(|c| c.as_materialized_series().str().ok())
                    .map(|strs| {
                        strs.into_iter()
                            .filter_map(|v| v.map(|s| s.trim().to_string()))
                            .filter(|s| !s.is_empty())
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default()
            })
            .unwrap_or_default()
            .into_iter()
            .fold(BTreeMap::new(), |mut map, centro| {
                let block = if centro.is_empty() {
                    compute_all_metrics(df, file_hint, std_ref)
                } else {
                    filter_df_by_centro(df, &centro)
                        .map(|sub| compute_all_metrics(&sub, file_hint, std_ref))
                        .unwrap_or_else(|| compute_all_metrics(df, file_hint, std_ref))
                };
                map.insert(centro, block);
                map
            }),
    }
}
