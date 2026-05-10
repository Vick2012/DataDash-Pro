# DataDash Pro BI

Aplicación de escritorio para dashboards de producción. Carga archivos Excel y visualiza métricas, gráficos y tablas. Procesa todo en local con Rust, sin backend externo.

## Requisitos

- **Node.js** 18+
- **Rust** (stable, con `rustup`; objetivo **x86_64-pc-windows-msvc** en Windows)
- **WebView2** (Windows 10/11 lo incluye)

### Windows: herramientas de compilación C++ (obligatorio para Tauri)

Hace falta el mismo entorno que compila aplicaciones nativas (no basta con VS Code):

1. Descarga **[Build Tools para Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/)** (o Visual Studio Community).
2. En la carga de trabajo marca **“Desarrollo de escritorio con C++”** (incluye **MSVC**, **Windows SDK** y herramientas como `link.exe` y **`rc.exe`** para el icono del .exe).
3. Tras instalar, **cierra y abre de nuevo** PowerShell o Cursor, o usa **“Símbolo del sistema para desarrolladores de VS” / “x64 Native Tools Command Prompt”** antes de `npm run tauri:dev`.

Sin esto suelen aparecer:

- `linker link.exe not found`
- `Are you sure you have RC.EXE in your $PATH?` (viene de `tauri-winres` al incrustar el icono)

## Inicio rápido

### Desde la raíz (DataDashPro)

```bash
npm install --prefix datadash_pro_bi
npm run tauri:dev
```

**Windows:** si aparece `linker link.exe not found`, MSVC no está en el PATH de esa consola. Use el script que carga el entorno de Visual Studio y luego compila:

```bash
npm run tauri:dev:win
```

También puede usar `scripts\tauri-dev-windows.cmd`. Si Visual Studio aparece como **instalación incompleta**, el script igual localiza `vcvars64.bat` recorriendo todas las instancias.

### Desde datadash_pro_bi

```bash
cd datadash_pro_bi
npm install
npm run tauri:dev
```

## Estructura

```
DataDashPro/
├── package.json           # Delegación a datadash_pro_bi
├── datadash_pro_bi/
│   ├── package.json       # Scripts Tauri (tauri:dev, tauri:build)
│   ├── frontend/          # React + Vite
│   ├── src-tauri/         # Tauri + Rust (procesa Excel)
│   └── PORTABLE.md        # Guía edición portable
└── README.md
```

## Mensaje “¿Desea terminar el trabajo por lotes (S/N)?”

Eso lo muestra **cmd** cuando se interrumpe un proceso. Responde **`S`** en **esa misma ventana** o cierra la terminal con el aspa. Si escribes `n` o `s` en **PowerShell** como comando nuevo, verás “término no reconocido”; es normal.

## Nota: IPC en dev mode (Windows)

En Windows, el comando `invoke` puede fallar en `tauri dev` (error `ipc.localhost` / `ERR_CONNECTION_REFUSED`). Para probar la carga de Excel, usa la versión compilada:

```bash
cd datadash_pro_bi
npm run tauri:build:portable
```

Luego ejecuta `src-tauri\target\release\datadash-pro-bi.exe`. En la versión compilada el upload funciona correctamente.

## Edición portable

```bash
cd datadash_pro_bi
npm run tauri:build:portable
```

El .exe se genera en `datadash_pro_bi/src-tauri/target/release/`. Ver [PORTABLE.md](datadash_pro_bi/PORTABLE.md).
