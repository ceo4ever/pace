---
name: pace-prompt
description: Analyze and rewrite a supplied question or prompt so its intent, missing details, and requested output are clear. Use when the user asks to improve a prompt or invokes pace-prompt with a question to refine.
---

# Prompt refinement

Refine the user's question into a prompt they can reuse. Do not perform the task described in the question unless the user also asks for its answer.

If no question was supplied, ask for it. Otherwise:

1. **Analyze the question.** Identify its core purpose, the concrete task, and any implied requirements or constraints. Preserve the user's intent, domain terms, and stated choices.
2. **Identify improvements.** Point out ambiguous wording, missing information that materially affects the result, and unnecessary complexity. Distinguish required details from optional ones. Do not invent facts to fill gaps.
3. **Rewrite the question.** Make the task clear and structured. Include relevant context already provided, the desired output format, and applicable constraints. Use a short placeholder for an essential unknown; ask a clarifying question only when no useful rewrite is possible without the answer.

Present the result in three sections: **Intent and task**, **What to clarify**, and **Rewritten prompt**. Translate the headings when appropriate. Keep the first two sections brief and make the rewritten prompt ready to copy. Use the language requested by the user; otherwise use the question's language.
