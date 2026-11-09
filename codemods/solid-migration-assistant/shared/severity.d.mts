export type SeverityId = "build" | "behavior" | "deprecated";
export declare const SEVERITY_TIERS: ReadonlyArray<{ readonly id: SeverityId; readonly label: string }>;
export declare function explicitSeverity(headline: string): SeverityId | null;
export declare function severityOf(headline: string): SeverityId;
