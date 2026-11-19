// fixture: real-world-solid-markdown-reconcile
// Origin: andi23rosca/solid-markdown, src/index.tsx at commit
// 66c00a5df5632b2a6b2cc3ec30fd2129b1a80ba3, reduced to the "reconcile"
// rendering strategy, with the unified pipeline stubbed. License: MIT
// (https://github.com/andi23rosca/solid-markdown/blob/66c00a5df5632b2a6b2cc3ec30fd2129b1a80ba3/package.json).
import { createMemo, createRenderEffect } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

type Root = { type: "root"; children: unknown[] };
const parse = (children: string): Root => ({ type: "root", children: [children] });

export const SolidMarkdown = (options: { children: string; renderingStrategy: "memo" | "reconcile" }) => {
	const [node, setNode] = createStore<Root>({ type: "root", children: [] });

	const generateNode = createMemo(() => parse(options.children));

	if (options.renderingStrategy === "reconcile") {
		createRenderEffect(() => {
			setNode(reconcile(generateNode()));
		});
	}

	return <div>{JSON.stringify(options.renderingStrategy === "memo" ? generateNode() : node)}</div>;
};
