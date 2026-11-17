#!/usr/bin/env node

import { main } from "../shared/run-workflow.mjs";

process.exitCode = await main();
