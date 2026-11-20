export declare const SOLID_BABEL_PLUGIN: string;
export declare function isSolidPreset(name: string | null): boolean;
export declare function presetBlocker(entry: {
  options: ReadonlyArray<{ name: string | null; value: string | null }> | "opaque" | null;
  after: ReadonlyArray<string | null>;
  plugins: "none" | "array" | "opaque";
  hasPlugin: boolean;
}): string | null;
export declare function bumpBabelConfig(text: string): {
  text: string;
  moved: Array<{ line: number; column: number }>;
  left: Array<{ line: number; column: number; reason: string }>;
} | null;
