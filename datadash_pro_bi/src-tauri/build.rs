fn main() {
    prepend_windows_rc_to_path();
    tauri_build::build()
}

/// El linker de recursos `rc.exe` viene con el Windows SDK pero a menudo no está en el PATH
/// al abrir PowerShell/Cursor “normal”. Tauri (tauri-winres) lo necesita para el .ico del .exe.
#[cfg(windows)]
fn prepend_windows_rc_to_path() {
    use std::path::{Path, PathBuf};

    let roots = [
        Path::new(r"C:\Program Files (x86)\Windows Kits\10\bin"),
        Path::new(r"C:\Program Files\Windows Kits\10\bin"),
    ];

    let mut rc_dirs: Vec<PathBuf> = Vec::new();
    for root in roots {
        let Ok(rd) = std::fs::read_dir(root) else {
            continue;
        };
        for ent in rd.flatten() {
            let ver_bin = ent.path();
            let rc = ver_bin.join("x64").join("rc.exe");
            if rc.is_file() {
                rc_dirs.push(ver_bin.join("x64"));
            }
        }
    }

    rc_dirs.sort();
    rc_dirs.dedup();

    if let Some(bin_x64) = rc_dirs.last() {
        let path = std::env::var("PATH").unwrap_or_default();
        std::env::set_var("PATH", format!("{};{}", bin_x64.display(), path));
        println!(
            "cargo:warning=DataDash: PATH ampliado con Windows RC: {}",
            bin_x64.display()
        );
    } else {
        println!("cargo:warning=DataDash: No se encontró rc.exe bajo 'Windows Kits\\10\\bin'. Instale el SDK de Windows (carga 'Desarrollo de escritorio con C++' en Visual Studio Installer).");
    }
}

#[cfg(not(windows))]
fn prepend_windows_rc_to_path() {}
