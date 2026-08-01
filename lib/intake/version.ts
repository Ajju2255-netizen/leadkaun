// Version stamps frozen onto every intake session. When any of these change,
// old sessions stay interpretable — you always know which logic produced a
// given report. (Your "this will save you years later" note.)

/** Overall Intake Engine version — bump on any behavioural change to profiling. */
export const INTAKE_ENGINE_VERSION = "intake_engine_v1"

/** Column-mapping ruleset version (lib/import/column-map.ts). */
export const MAPPING_VERSION = "map_v1"

/** Analysis ruleset version (lib/intake/analyse.ts). */
export const ANALYSIS_VERSION = "analyse_v1"
