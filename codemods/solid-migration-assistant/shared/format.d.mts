import type { Finding, Rewrite } from "./finding.ts";

export type SeverityId = "build" | "behavior" | "deprecated";
export declare const SEVERITY_TIERS: ReadonlyArray<{ readonly id: SeverityId; readonly label: string }>;
export declare const REPORT_MARKER: string;
export declare function byLocation<T extends { file: string; line: number; column: number; rule: string }>(entries: readonly T[]): T[];
export declare function lintSentence(rules: readonly string[]): string | null;
export declare function renderFinding(finding: Finding): string;
export declare function renderRewrite(rewrite: Rewrite): string;
export declare function renderText(report: { findings?: readonly Finding[]; rewrites?: readonly Rewrite[]; solidVersion: string }): string;
