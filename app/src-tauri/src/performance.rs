use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use serde::Serialize;

const MAX_SAMPLES: usize = 250;

#[derive(Debug, Clone, Serialize)]
pub struct PerformanceSample {
    pub name: String,
    pub duration_ms: u128,
    pub at_ms: i64,
    pub ok: bool,
    pub items: Option<usize>,
    pub bytes: Option<u64>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PerformanceSummary {
    pub name: String,
    pub count: usize,
    pub failures: usize,
    pub avg_ms: u128,
    pub max_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
pub struct PerformanceSnapshot {
    pub recent: Vec<PerformanceSample>,
    pub summary: Vec<PerformanceSummary>,
}

#[derive(Default)]
pub struct PerformanceMetrics {
    samples: Mutex<VecDeque<PerformanceSample>>,
}

impl PerformanceMetrics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(
        &self,
        name: impl Into<String>,
        duration_ms: u128,
        ok: bool,
        items: Option<usize>,
        bytes: Option<u64>,
        source: Option<&str>,
    ) {
        let sample = PerformanceSample {
            name: name.into(),
            duration_ms,
            at_ms: now_ms(),
            ok,
            items,
            bytes,
            source: source.map(str::to_string),
        };

        if let Ok(mut samples) = self.samples.lock() {
            samples.push_back(sample);
            while samples.len() > MAX_SAMPLES {
                samples.pop_front();
            }
        }
    }

    pub fn snapshot(&self) -> PerformanceSnapshot {
        let recent = self
            .samples
            .lock()
            .map(|samples| samples.iter().cloned().collect::<Vec<_>>())
            .unwrap_or_default();

        let mut grouped: HashMap<String, (usize, usize, u128, u128)> = HashMap::new();
        for sample in &recent {
            let entry = grouped.entry(sample.name.clone()).or_insert((0, 0, 0, 0));
            entry.0 += 1;
            if !sample.ok {
                entry.1 += 1;
            }
            entry.2 += sample.duration_ms;
            entry.3 = entry.3.max(sample.duration_ms);
        }

        let mut summary = grouped
            .into_iter()
            .map(|(name, (count, failures, total_ms, max_ms))| PerformanceSummary {
                name,
                count,
                failures,
                avg_ms: if count == 0 { 0 } else { total_ms / count as u128 },
                max_ms,
            })
            .collect::<Vec<_>>();
        summary.sort_by(|left, right| right.avg_ms.cmp(&left.avg_ms));

        PerformanceSnapshot { recent, summary }
    }

    pub fn clear(&self) {
        if let Ok(mut samples) = self.samples.lock() {
            samples.clear();
        }
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}
