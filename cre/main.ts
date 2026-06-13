import { Runner } from "@chainlink/cre-sdk";

import { configSchema, initWorkflow, type WorkflowConfig } from "./workflow";

export async function main() {
  const runner = await Runner.newRunner<WorkflowConfig>({ configSchema });
  await runner.run(initWorkflow);
}

main();
