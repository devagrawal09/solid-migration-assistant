import type { Codemod } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";
import { acquireLock, getState, setState } from "codemod:workflow";
import { ANALYSIS_STATE_KEY } from "../shared/analysis.ts";
import type { Finding, Rewrite } from "../shared/finding.ts";
import { REPORT_MARKER, byLocation, renderText } from "../shared/format.mjs";
import { SOLID_TARGET_VERSION } from "../shared/target.ts";
import { TRANSFORM_REPORT_STATE_KEY } from "../shared/transform.ts";

const EMITTED_STATE_KEY = "solid-migration-assistant-report-emitted";

/**
 * Prints every finding or rewrite the rule steps accumulated, once. By
 * default that is the text report; the launcher passes `--param
 * format=json` and receives one `SMA-REPORT <json>` line instead, which it
 * merges with its own project findings and renders itself.
 */
const emitReport: Codemod<TSX> = async (_root, options) => {
  const release = acquireLock(EMITTED_STATE_KEY);
  try {
    if (getState<boolean>(EMITTED_STATE_KEY)) return null;
    setState(EMITTED_STATE_KEY, true, false);

    const findings = byLocation(getState<Finding[]>(ANALYSIS_STATE_KEY) ?? []);
    const rewrites = byLocation(getState<Rewrite[]>(TRANSFORM_REPORT_STATE_KEY) ?? []);
    const json = options?.params?.format === "json";
    if (json || findings.length > 0 || rewrites.length > 0) {
      console.log(
        json
          ? `${REPORT_MARKER}${JSON.stringify({ findings, rewrites })}`
          : renderText({ findings, rewrites, solidVersion: SOLID_TARGET_VERSION }),
      );
    }
  } finally {
    release();
  }

  return null;
};

export default emitReport;
