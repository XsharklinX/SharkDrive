use tauri::State;

use crate::performance::{PerformanceMetrics, PerformanceSnapshot};

#[tauri::command]
pub fn cmd_get_performance_snapshot(
    metrics: State<'_, PerformanceMetrics>,
) -> PerformanceSnapshot {
    metrics.snapshot()
}

#[tauri::command]
pub fn cmd_clear_performance_metrics(metrics: State<'_, PerformanceMetrics>) {
    metrics.clear();
}
