Quick Codebase Health Check

Perform a rapid assessment of codebase health - documentation coverage and file size compliance.

You MUST follow these steps quickly and present results in a structured "at a glance" format:

**Step 1: Documentation Coverage Check**
Run `npm run docs:check` to find all files missing @fileoverview headers.
- COLLECT the list of files missing documentation
- DO NOT make any edits or fixes
- Note the count and percentage of files missing documentation

**Step 2: File Size Analysis** 
Run `npm run linecount` to check file sizes across the codebase.
- Identify files over 512 lines (warning threshold)
- Identify files over 1024 lines (violation threshold, except "main" classes)
- Note any files approaching these limits (within 50 lines)

**Step 3: Present Structured Summary**
Present all findings in a clean, structured format:

```
📊 CODEBASE HEALTH REPORT
========================

📝 DOCUMENTATION COVERAGE
- Files missing @fileoverview: X/Y (Z%)
- Missing documentation files:
  • path/to/file1.ts
  • path/to/file2.ts

📏 FILE SIZE COMPLIANCE  
- Files over 512 lines (Warning): X files
  • file1.ts (XXX lines)
  • file2.ts (XXX lines)
  
- Files over 1024 lines (Critical): X files  
  • largefile.ts (XXXX lines)

⚠️ FILES APPROACHING LIMITS
- Near 512 line limit: X files
- Near 1024 line limit: X files

✅ OVERALL HEALTH SCORE
Documentation: X% complete
File Size: X files compliant, Y files need attention
```

**Step 4: Quick Recommendations**
Provide 2-3 bullet points of immediate actionable recommendations based on findings.

This command should complete in under 30 seconds and give users a complete overview of codebase health without making any changes.