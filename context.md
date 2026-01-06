以下是从专业角度提出的修改意见：

1. 增强“测试用例提取逻辑” (Test Case Extraction Logic)
问题：Prompt 中虽然有 "1:1 mapping" 的规则，但对于如何从非结构化的自然语言文本（test_spec.txt）提取结构化数据，缺乏更具体的思维链（CoT）指导。 风险：Claude 可能会遗漏某些隐式的前置条件，或者对模糊的 Spec 描述产生误解，导致生成的 JSON 质量不高。 建议：要求 Agent 在生成 JSON 之前，先进行一轮“思维链”分析。

新增指令：

"Before generating test_cases.json, perform a Structured Analysis Step: Read the spec, list all identified functional requirements, and explicitly map each requirement to a planned Test Case ID. This ensures no requirement is overlooked."

2. 降低语气强度，减少“咆哮式”指令
问题：Prompt 中大量使用了 CRITICAL、ALWAYS、NEVER、WARNING 以及全大写强调。 依据：文档指出，Claude Opus 4.5 对 System Prompt 比以前的模型更敏感。过于激进的语言（如 "CRITICAL: You MUST..."）可能导致工具过度触发或模型变得僵化。 建议：将指令语气调整为“专业且规范”而非“警告且强制”。

修改前：CRITICAL: Always use relative paths... NEVER use absolute paths...

修改后：Path Protocol: Use relative paths (e.g., ./test_spec.txt) for all file operations. Absolute paths are strictly prohibited to ensure portability.
