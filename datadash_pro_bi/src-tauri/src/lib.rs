mod commands;

use commands::bi::{
    generate_boletin_cmd, generate_boletin_pdf_cmd, list_boletin_filters_cmd, load_std_por_area,
    upload_excel, upload_excel_bytes,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            upload_excel,
            upload_excel_bytes,
            load_std_por_area,
            list_boletin_filters_cmd,
            generate_boletin_cmd,
            generate_boletin_pdf_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
