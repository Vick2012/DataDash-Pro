mod commands;

use commands::bi::{
    check_llm_availability, generate_boletin_cmd, generate_boletin_pdf_cmd,
    get_ollama_url, list_boletin_filters_cmd, list_llm_models,
    load_chat_history, load_std_por_area, query_llm,
    save_chat_history, upload_excel, upload_excel_bytes,
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
            get_ollama_url,
            check_llm_availability,
            list_llm_models,
            query_llm,
            save_chat_history,
            load_chat_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
