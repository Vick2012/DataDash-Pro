import { isTauri } from '@tauri-apps/api/core';

/**
 * True only inside the Tauri WebView. Abrir solo http://localhost:5175 en el navegador
 * no expone las APIs de Tauri: diálogo / invoke no funcionan ahí.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return isTauri();
}
