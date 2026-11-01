import { z } from 'zod';
import { DraftOutput, Usage } from '../ai/model.ts';
import { Assessment } from '../pricing/model.ts';

export const DIMENSIONS = ['intent_fidelity', 'language', 'helpfulness'] as const;
export const Grade = z.enum(['pass', 'fail', 'not_assessable']);
export const Grades = z.strictObject({
  intent_fidelity: Grade,
  language: Grade,
  helpfulness: Grade,
});
const Dimension = z.strictObject({ grade: Grade, rationale: z.string().min(1).max(1200) });
export const JudgeOutput = z.strictObject({
  intent_fidelity: Dimension,
  language: Dimension,
  helpfulness: Dimension,
});
export const GoldCase = z.object({
  id: z.string(),
  tenantId: z.enum(['qamar', 'rimal']),
  category: z.enum(['normal', 'missing', 'rule', 'out_of_catalogue', 'injection', 'cross_tenant']),
  language: z.enum(['English', 'Arabic', 'Mixed']),
  messages: z.array(z.string()).min(1).max(20),
  expected: z.object({
    intent: z.enum(['quote', 'faq', 'support', 'spam']).optional(),
    lines: z
      .array(
        z.object({
          sku: z.string().nullable(),
          quantity: z.string().nullable().optional(),
          mode: z.enum(['buy', 'month', 'day']).optional(),
          periods: z.string().nullable().optional(),
        }),
      )
      .optional(),
    discountPercent: z.string().nullable().optional(),
    disposition: z.enum(['needs_approval', 'hand_off', 'drop']).optional(),
    reasons: z.array(z.string()).optional(),
    missing: z.boolean().optional(),
    totalMinor: z.number().int().optional(),
  }),
  guidance: z.string().min(1),
});
export type GoldCase = z.infer<typeof GoldCase>;
export const Check = z.object({
  name: z.string(),
  pass: z.boolean(),
  hard: z.boolean(),
  detail: z.string(),
});
export const CaseResult = z.object({
  case: GoldCase,
  output: DraftOutput.nullable(),
  assessment: Assessment.nullable(),
  reply: z.string().nullable(),
  checks: z.array(Check),
  judge: JudgeOutput.nullable(),
  error: z.string().nullable(),
  generation: z.object({
    responseId: z.string().nullable(),
    model: z.string(),
    durationMs: z.number(),
    usage: Usage.nullable(),
  }),
  judging: z.object({
    responseId: z.string().nullable(),
    model: z.string(),
    durationMs: z.number(),
    usage: Usage.nullable(),
    error: z.string().nullable(),
  }),
});
export type CaseResult = z.infer<typeof CaseResult>;
export const Gate = z.object({
  passed: z.boolean(),
  reasons: z.array(z.string()),
  passedCases: z.number(),
  total: z.number(),
  passRate: z.number(),
  arabicPassed: z.number(),
  arabicTotal: z.number(),
  hardFailures: z.number(),
  regressions: z.array(z.string()),
});
export const RunReport = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  tenantId: z.enum(['qamar', 'rimal']),
  createdAt: z.iso.datetime(),
  variant: z.enum(['current', 'degraded']),
  suiteVersion: z.string(),
  suiteHash: z.string(),
  contextHash: z.string(),
  agent: z.object({
    id: z.string(),
    model: z.string(),
    promptHash: z.string(),
    parameters: z.unknown(),
    schemaHash: z.string(),
    engineVersion: z.string(),
  }),
  judge: z.object({
    model: z.string(),
    promptHash: z.string(),
    version: z.string(),
    parameters: z.unknown().optional(),
  }),
  baselineId: z.string().nullable(),
  accepted: z.boolean(),
  baselineReset: z.boolean().default(false),
  gate: Gate,
  results: z.array(CaseResult),
});
export type RunReport = z.infer<typeof RunReport>;
export const RunSummary = RunReport.omit({ results: true });
export const LabelInput = z.strictObject({
  caseId: z.string().min(1).max(100),
  approverId: z.string().min(1).max(100),
  dimensions: Grades,
  rationale: z.string().trim().min(1).max(1000),
});
export const PromoteInput = z.strictObject({
  approverId: z.string().min(1).max(100),
  reason: z.string().trim().min(1).max(1000),
  runId: z.string().min(1).max(100),
});
export const HumanLabel = LabelInput.extend({
  approverName: z.string(),
  createdAt: z.string(),
}).strip();
export const RunDetail = z.object({
  report: RunReport,
  labels: z.array(HumanLabel),
  calibration: z.object({
    labels: z.number(),
    comparisons: z.number(),
    agreements: z.number(),
    disagreements: z.array(z.string()),
    ready: z.boolean(),
  }),
});
export const EvaluationOverview = z.object({
  currentAgentId: z.string(),
  currentContextHash: z.string(),
  runs: z.array(RunSummary),
  trust: z.object({
    level: z.enum(['supervised', 'autonomous']),
    reason: z.string(),
    at: z.string().nullable(),
    by: z.string().nullable(),
  }),
  ledger: z.array(
    z.object({
      id: z.string(),
      agentId: z.string(),
      level: z.enum(['supervised', 'autonomous']),
      reason: z.string(),
      at: z.string(),
      by: z.string().nullable(),
      runId: z.string(),
    }),
  ),
});

export const HumanEvidence = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  labels: z.array(HumanLabel.extend({ tenantId: z.enum(['qamar', 'rimal']), runId: z.string() })),
  events: z.array(
    z.object({
      tenantId: z.enum(['qamar', 'rimal']),
      id: z.string(),
      agentId: z.string(),
      contextHash: z.string(),
      runId: z.string(),
      level: z.enum(['supervised', 'autonomous']),
      approverId: z.string().nullable(),
      approverName: z.string().nullable(),
      reason: z.string(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
