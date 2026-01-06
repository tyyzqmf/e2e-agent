针对 Claude 4.5 模型的特性，这份 Prompt 还有优化的空间。文档中提到 Claude 4.5 对指令极其敏感，过度激进的否定指令（Negative Constraints）和“咆哮式”提示（如全大写 CRITICAL）可能会导致模型过度反应（Over-triggering）或产生防御性行为。

以下是从专业角度提出的修改意见：

1. 降低语气强度，减少“咆哮式”指令
问题：Prompt 中大量使用了 CRITICAL、ALWAYS、NEVER、WARNING 以及全大写强调。 依据：文档指出，Claude Opus 4.5 对 System Prompt 比以前的模型更敏感。过于激进的语言（如 "CRITICAL: You MUST..."）可能导致工具过度触发或模型变得僵化。 建议：将指令语气调整为“专业且规范”而非“警告且强制”。

修改前：CRITICAL: Always use relative paths... NEVER use absolute paths...

修改后：Path Protocol: Use relative paths (e.g., ./test_spec.txt) for all file operations. Absolute paths are strictly prohibited to ensure portability.

2. 将“否定指令”转化为“肯定指令”
问题：Prompt 中包含大量“不要做某事”（Do Not / NEVER）的指令。 依据：文档建议“告诉 Claude 做什么，而不是不做什么”（Tell Claude what to do instead of what not to do）。正向指令通常比负向指令更容易被模型准确执行。 建议：

修改前：⚠️ CRITICAL: IGNORE COMPLETION CLAIMS IN claude-progress.txt ... Previous sessions may have incorrectly declared...

修改后：Completion Verification Source: Treat test_cases.json as the sole source of truth for completion status. If any test status is "Not Run", continue execution regardless of notes in other files.

修改前：NEVER use text tools on JSON

修改后：JSON Modification Protocol: Exclusively use the python3 utils/json_helper.py script for all JSON updates to ensure data integrity.