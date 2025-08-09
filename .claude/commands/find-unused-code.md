# Find Unused Code Command

## Objective
Use the unused-code-analyzer sub-agent to perform a comprehensive scan of the codebase for dead code including unused functions, classes, imports, files, and other code elements that can be safely removed.

## Critical Rules
- **MUST** use the `unused-code-analyzer` sub-agent for the analysis
- **MUST** perform a FULL SWEEP of the entire codebase
- **MUST** be 100% certain before marking any code as unused
- **MUST** present findings in a structured report format
- **NEVER** make any code changes or deletions - this is analysis-only
- **MUST** err on the side of caution for borderline cases

## Execution Steps

### Step 1: Run Unused Code Analysis
- Use the Task tool with `unused-code-analyzer` sub-agent
- Instruct the sub-agent to scan the entire codebase for unused code elements
- Request comprehensive analysis of all TypeScript/JavaScript files
- Include analysis of imports, exports, functions, classes, variables, types, and entire files

### Step 2: Process and Present Results
Structure the findings in a clear, actionable report:

```
## 🔍 Unused Code Analysis Results

### ✅ DEFINITELY UNUSED (Safe to Remove)
**Functions:**
- `functionName()` in src/path/file.ts:line - No references found
- `anotherFunction()` in src/path/file2.ts:line - No usages detected

**Classes:**
- `UnusedClass` in src/path/file.ts:line - No instantiations found
- `OldHandler` in src/path/file2.ts:line - Replaced by newer implementation

**Imports:**
- `import { unusedUtil } from './utils'` in src/file.ts:line - Imported but never used
- `import * as oldLib from 'old-library'` in src/file2.ts:line - Legacy import

**Files:**
- src/legacy/oldFeature.ts - No imports or references found
- src/utils/deprecatedHelper.ts - Completely orphaned

### ⚠️ POTENTIALLY UNUSED (Manual Review Required)
**Functions:**
- `debugHelper()` in src/utils/debug.ts:line - May be used conditionally
- `eventHandler()` in src/handlers/events.ts:line - Framework callback, verify usage

**Classes:**
- `BaseClass` in src/base/abstract.ts:line - May be inherited by dynamic imports

### 📊 ANALYSIS SUMMARY
- Total files scanned: X
- Functions analyzed: X
- Classes analyzed: X
- Imports analyzed: X
- Definitely unused items: X
- Items requiring review: X
- Estimated cleanup impact: X lines of code
```

### Step 3: Provide Cleanup Guidance
After presenting results:
- Explain confidence levels and reasoning for each finding
- Provide specific guidance for manual review items
- Suggest cleanup approach and priority order
- Warn about any framework-specific considerations
- Recommend testing strategy after cleanup

## Success Criteria
- Complete codebase analysis performed with high accuracy
- Clear categorization of unused vs potentially unused code
- Detailed reasoning provided for all findings
- Actionable cleanup guidance delivered
- Zero false positives in "definitely unused" category

## Special Considerations
- **Framework Awareness**: Consider Discord.js event handlers, lifecycle methods
- **TypeScript Specifics**: Handle type-only imports, interface inheritance
- **Dynamic Usage**: Account for string-based imports and reflection
- **Test Files**: Recognize test-specific patterns and utilities
- **Entry Points**: Never mark main entry points or public API methods as unused
- **Configuration**: Consider usage in JSON/YAML config files

## Notes
- This command is READ-ONLY analysis - it never modifies code
- Always provide context and reasoning for unused code findings
- Include file paths and line numbers for easy navigation
- Consider both direct and indirect usage patterns
- Pay special attention to exported functions that might be part of public APIs
- Remember that some "unused" code might be intentionally kept for future use