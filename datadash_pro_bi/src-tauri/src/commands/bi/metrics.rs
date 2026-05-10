//! Métricas BI para datos Printux

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime};
use polars::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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
}

#[derive(Serialize, Deserialize)]
pub struct OoeMensual {
    pub periodo: String,
    pub horas_productivas: f64,
    pub horas_totales: f64,
    pub ooe: f64,
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

fn eficiencia_funcionarios(df: &DataFrame, top_n: usize) -> Vec<EficienciaFuncionario> {
    if df.column("funcionario").is_err() {
        return vec![];
    }

    let has_horas = df.column("horas").is_ok();
    let has_cantidad = df.column("cantidad").is_ok();

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

    func.into_iter()
        .zip(hrs.into_iter())
        .zip(cant.into_iter().chain(std::iter::repeat(0.0)))
        .zip(prod.into_iter().chain(std::iter::repeat(0.0)))
        .map(|(((f, h), c), p)| EficienciaFuncionario {
            funcionario: f,
            horas: (h * 100.0).round() / 100.0,
            produccion: c as i64,
            productividad: (p * 100.0).round() / 100.0,
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
        df.clone()
            .lazy()
            .with_column(col("horas").alias("horas_uso"))
            .with_column(lit(0.0).alias("mantenimiento"))
            .with_column(lit(0.0).alias("varadas"))
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
        .map(|((((m, u), ma), v), t)| EficienciaMaquina {
            maquina: m,
            horas_uso: (u * 100.0).round() / 100.0,
            mantenimiento: (ma * 100.0).round() / 100.0,
            varadas: (v * 100.0).round() / 100.0,
            total: (t * 100.0).round() / 100.0,
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

pub fn compute_all_metrics(df: &DataFrame, file_hint: Option<&str>) -> AllMetrics {
    let (ooe_global, ooe_mensual) = compute_ooe(df, file_hint);
    AllMetrics {
        resumen: kpi_resumen(df, ooe_global),
        produccion_maquina: produccion_por_maquina(df, 15),
        horas_area: horas_por_area(df, 15),
        eficiencia_funcionarios: eficiencia_funcionarios(df, 20),
        productivo_improductivo: productivo_vs_improductivo(df),
        uso_maquinas: produccion_por_maquina(df, 15),
        eficiencia_maquina: eficiencia_maquina(df, 20),
        ooe_mensual,
    }
}

pub fn compute_metrics_bundle(df: &DataFrame, file_hint: Option<&str>) -> MetricsBundle {
    let global = compute_all_metrics(df, file_hint);
    let centros = list_centros(df);
    let mut por_centro = BTreeMap::new();
    for c in &centros {
        if let Some(sub) = filter_df_by_centro(df, c) {
            por_centro.insert(c.clone(), compute_all_metrics(&sub, file_hint));
        }
    }
    MetricsBundle {
        global,
        centros,
        por_centro,
    }
}
