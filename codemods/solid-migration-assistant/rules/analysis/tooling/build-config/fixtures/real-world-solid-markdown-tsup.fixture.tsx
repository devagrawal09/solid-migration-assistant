// fixture: real-world-solid-markdown-tsup
// Origin: andi23rosca/solid-markdown, tsup.config.ts at commit
// 66c00a5df5632b2a6b2cc3ec30fd2129b1a80ba3, reduced to the preset import and
// its entry options. License: MIT
// (https://github.com/andi23rosca/solid-markdown/blob/66c00a5df5632b2a6b2cc3ec30fd2129b1a80ba3/package.json).
import { defineConfig } from "tsup";
import * as preset from "tsup-preset-solid";

const preset_options: preset.PresetOptions = {
	entries: [{ entry: "src/index.tsx", dev_entry: true, server_entry: true }],
	drop_console: true,
};

export default defineConfig((config) => {
	const parsed_options = preset.parsePresetOptions(preset_options, !!config.watch);
	return preset.generateTsupOptions(parsed_options);
});
