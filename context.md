1. 抽离提示词 src/agent/prompts/test_executor_prompt.md 中的report相关逻辑
2. 把report相关逻辑放到 src/agent/prompts/test_report_prompt.md 中
3. 修改 runAutonomousTestingAgent 逻辑，在住循环结束后单独执行一个agent运行report逻辑
4. 删除 CostReportGenerator 相关的代码不用生成 cost_statistics.md