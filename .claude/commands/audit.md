# Security Audit Command

You are tasked with performing a comprehensive security audit of the Discord bot codebase using the security-audit-specialist agent.

## Instructions

1. **Launch the security-audit-specialist agent** to perform a complete security sweep of the entire codebase
2. **Task the agent** with identifying:
   - **COMMITTED secrets**: Hardcoded API keys, tokens, or secrets that are tracked in git
   - **Actually exposed credentials**: Files with secrets that are NOT in .gitignore
   - Insecure authentication patterns in source code
   - Potential injection vulnerabilities
   - Unsafe file handling or path traversal risks
   - Discord bot permission escalations
   - Database security issues
   - Unsafe environment variable handling patterns
   - Any other security vulnerabilities

   **IMPORTANT**: The agent must first check:
   - `git status` to see what files are tracked
   - `.gitignore` contents to verify secret files are properly excluded
   - Only flag secrets as "exposed" if they are actually committed to the repository
   - Verify actual file contents and context before flagging issues (don't assume based on file names)

3. **Analyze the agent's findings**:
   - If NO issues are found: Congratulate the user and confirm the codebase is secure
   - If issues ARE found: Present them professionally with a structured resolution plan

## Expected Behavior

### No Issues Found
"🎉 Congratulations! The security audit has completed successfully with no security issues detected. Your Discord bot codebase follows security best practices and is ready for deployment."

### Issues Found
Present findings in this format:
```
🔒 Security Audit Results

❌ CRITICAL ISSUES FOUND: [count]
❌ HIGH PRIORITY ISSUES: [count]  
⚠️ MEDIUM PRIORITY ISSUES: [count]
ℹ️ LOW PRIORITY ISSUES: [count]

## Detailed Findings

[List each issue with file location, description, and severity]

## Resolution Plan

### Immediate Actions Required (Critical/High)
1. [Specific action item]
2. [Specific action item]

### Recommended Improvements (Medium/Low)  
1. [Specific action item]
2. [Specific action item]

Next steps: Would you like me to help implement these security fixes?
```

## Agent Invocation

Use the Task tool with subagent_type "security-audit-specialist" and provide comprehensive instructions for a full codebase security sweep focusing on Discord bot security patterns, API integrations, and data handling.

**CRITICAL LESSONS LEARNED**: The agent must distinguish between:
- ✅ **Properly managed secrets**: Files with secrets that are in `.gitignore` and not committed (STANDARD PRACTICE)
- ❌ **Actually exposed secrets**: API keys hardcoded in source files that ARE committed to git
- ✅ **Protected features**: Code execution commands with proper authentication/authorization (verify auth patterns before flagging)
- ❌ **Actual vulnerabilities**: Unauthenticated or poorly secured dangerous operations

**MANDATORY VERIFICATION STEPS** - The agent MUST:

1. **Verify version control status before flagging ANY file**:
   - Use `git log --all --full-history -- <filename>` to check if file was ever committed
   - Check if file is listed in `.gitignore`
   - Use `git status --ignored` to see current ignored files
   - Only flag as "exposed" if sensitive files are actually tracked in version control

2. **Understand context before flagging functionality**:
   - Examine authentication patterns (operator whitelists, Discord permissions, role checks)
   - Look for existing security controls (sandboxing, input validation, rate limiting)
   - Check configuration context (development vs production settings)
   - Don't flag features as "insecure" without verifying actual access controls

3. **Investigate before assuming**:
   - Read actual file contents and surrounding code context
   - Understand the application's security model and intended use
   - Verify if apparent "vulnerabilities" have mitigating controls
   - Focus on actual exploitable weaknesses, not theoretical risks

4. **Focus on REAL vulnerabilities only**:
   - SQL injection without parameterized queries
   - Hardcoded secrets in committed source code
   - Authentication bypass vulnerabilities  
   - Path traversal with no validation
   - Command injection without sanitization

**AGENT MUST**: Investigate and understand the actual security posture rather than making assumptions. Verify claims with evidence before flagging issues.