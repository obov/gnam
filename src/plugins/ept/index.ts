import { definePlugin } from "../../core/plugin.ts"
import { format } from "../../core/violation.ts"
import { EXPERIMENT_FILE, experimentViolations } from "./experiment.ts"

export default definePlugin({
  id: "ept",
  version: "0.1.0",
  verify: (cwd, files) => experimentViolations(cwd, files),
  commands: {
    check: {
      describe: "<experiments/agent-workflows/<id>/record.json>  실험 기록 하나 검사",
      run(args, cwd) {
        const file = args[0] ?? ""
        if (!EXPERIMENT_FILE.test(file)) {
          console.error("사용: gnam run ept check experiments/agent-workflows/<id>/record.json")
          return 1
        }
        const violations = experimentViolations(cwd, [file])
        if (violations.length > 0) {
          console.error(format(violations))
          return 1
        }
        console.log("실험 기록 검사 통과")
        return 0
      },
    },
  },
  skills: ["skills/gnam-ept"],
  agentsMd: "agents.md",
})
