# DataDash Pro BI - Edición portable

Guía para generar la versión portable y usarla en otro PC sin instalación.

## 1. Generar la edición portable

### Opción A: Solo ejecutable (recomendada para USB)

```bash
npm run tauri:build:portable
```

Esto crea el archivo `datadash-pro-bi.exe` en:

```
datadash_pro_bi/src-tauri/target/release/datadash-pro-bi.exe
```

El ejecutable es autocontenido: incluye el frontend (React) y procesa Excel en Rust sin backend externo.

### Opción B: Con instalador (para distribución tradicional)

```bash
npm run tauri:build
```

Genera en `src-tauri/target/release/bundle/`:
- **NSIS**: `DataDash Pro BI_1.0.0_x64-setup.exe` — instalador gráfico
- **MSI**: `DataDash Pro BI_1.0.0_x64_en-US.msi` — instalador de Windows

---

## 2. Copiar a otro PC

### Con la edición portable (solo .exe)

1. Copia `datadash-pro-bi.exe` a una carpeta o USB.
2. En el otro PC, pega el archivo donde quieras y haz doble clic.

### Con carpeta completa

Si prefieres llevar todo junto:
1. Crea una carpeta, por ejemplo `DataDashProBI`.
2. Copia dentro el `datadash-pro-bi.exe`.
3. Copia la carpeta entera al otro PC o a una unidad USB.

---

## 3. Requisitos en el PC de destino

- **Windows 10/11** (64 bits).
- **WebView2 Runtime**: en la mayoría de equipos con Windows 10/11 ya está instalado.
  - Si faltara, se puede descargar desde:
  - https://developer.microsoft.com/microsoft-edge/webview2/

---

## 4. Uso

1. Ejecuta `datadash-pro-bi.exe`.
2. Arrastra o selecciona un archivo Excel (.xlsx, .xls).
3. Usa los dashboards: resumen, producción, horas, eficiencia, etc.
4. No requiere internet ni instalación adicional.

---

## 5. Resumen de comandos

| Comando | Salida |
|---------|--------|
| `npm run tauri:build:portable` | Solo `datadash-pro-bi.exe` |
| `npm run tauri:build` | Instaladores NSIS y MSI |
| `npm run tauri:dev` | Desarrollo con recarga |
