export type StageCompletionActionType =
  | "advance_next"
  | "mark_won"
  | "mark_lost"
  | "move_to_stage"
  | "none";

export interface StageCompletionAutomation {
  action: StageCompletionActionType;
  target_stage_id?: string | null;
}

export interface QuestionDisqualificationConfig {
  enabled: boolean;
  trigger_value: string; // e.g. "Sim"
  action: "mark_lost" | "move_to_stage";
  target_stage_id?: string | null;
  reason?: string | null;
}

export interface SelectWithObservationConfig {
  choices: string[];
  trigger_options?: string[]; // e.g. ["Sim"] or ["Outro"]
  observation_required?: boolean; // default true
  observation_placeholder?: string; // e.g. "Qual e por quê?"
  disqualification?: QuestionDisqualificationConfig | null;
}

export interface SimpleSelectConfig {
  choices: string[];
  disqualification?: QuestionDisqualificationConfig | null;
}

export type StageChecklistOptions = string[] | SelectWithObservationConfig | SimpleSelectConfig;

export interface StageChecklistItem {
  id: string;
  stage_id: string;
  company_id: string;
  title: string;
  description?: string | null;
  response_type: StageChecklistResponseType;
  options?: StageChecklistOptions;
  is_required: boolean;
  order_index: number;
  created_at?: string;
  created_by?: string | null;
}

export interface OpportunityStageAnswer {
  id?: string;
  opportunity_id: string;
  item_id: string;
  completed: boolean;
  value?: string | null;
  answered_at?: string;
  answered_by?: string | null;
}

export interface StageQualificationProgress {
  stageId: string;
  stageName: string;
  stageColor: string;
  order: number;
  totalRequired: number;
  completedRequired: number;
  totalItems: number;
  completedItems: number;
  isCompleted: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  items: (StageChecklistItem & { answer?: OpportunityStageAnswer | null })[];
}

export function getSelectOptions(options?: StageChecklistOptions | null): string[] {
  if (!options) return [];
  if (Array.isArray(options)) {
    return options.map((opt) => (typeof opt === "string" ? opt : String(opt)));
  }
  if (typeof options === "object" && "choices" in options && Array.isArray(options.choices)) {
    return options.choices;
  }
  return [];
}

export function getSelectObservationConfig(
  options?: StageChecklistOptions | null,
): SelectWithObservationConfig | null {
  if (!options) return null;
  if (
    typeof options === "object" &&
    !Array.isArray(options) &&
    "choices" in options &&
    Array.isArray(options.choices)
  ) {
    return options as SelectWithObservationConfig;
  }
  return null;
}

export function formatAnswerValue(option: string, observation?: string | null): string {
  if (!observation || !observation.trim()) return option;
  return `${option} — Obs: ${observation.trim()}`;
}

export function parseAnswerValue(val?: string | null): { selected: string; observation: string } {
  if (!val) return { selected: "", observation: "" };
  if (val.includes(" — Obs: ")) {
    const parts = val.split(" — Obs: ");
    return { selected: parts[0], observation: parts.slice(1).join(" — Obs: ") };
  }
  try {
    if (val.startsWith("{") && val.endsWith("}")) {
      const parsed = JSON.parse(val) as { option?: string; observation?: string };
      if (parsed.option) {
        return { selected: parsed.option || "", observation: parsed.observation || "" };
      }
    }
  } catch {
    // Non-JSON format, fallback to raw value
  }
  return { selected: val, observation: "" };
}

export function getQuestionDisqualification(
  options?: StageChecklistOptions | null,
): QuestionDisqualificationConfig | null {
  if (!options || typeof options !== "object" || Array.isArray(options)) return null;
  if ("disqualification" in options && options.disqualification) {
    const disq = options.disqualification;
    if (disq.enabled && disq.trigger_value) {
      return disq;
    }
  }
  return null;
}
