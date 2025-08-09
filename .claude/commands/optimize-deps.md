# Optimize Dependencies Command

## Objective
Use the dependency-analyzer sub-agent to perform a comprehensive scan of the codebase for unused dependencies, then optionally remove them to optimize the project.

## Critical Rules
- **MUST** use the `dependency-analyzer` sub-agent for the analysis
- **MUST** perform a FULL SWEEP of the entire codebase
- **MUST** present findings in a structured list before taking any action
- **MUST** ask for user confirmation before removing any dependencies
- **MUST** run `npm install` after removing dependencies to clean up node_modules

## Execution Steps

### Step 1: Run Dependency Analysis
- Use the Task tool with `dependency-analyzer` sub-agent
- Instruct the sub-agent to scan the entire codebase for unused dependencies
- Request a comprehensive analysis of package.json vs. actual code usage

### Step 2: Process Results
If **NO unused dependencies found**:
- Politely report to user that all dependencies are being used
- Provide a brief summary of the analysis scope

If **unused dependencies ARE found**:
- Present findings in a structured list format:
  ```
  ## Unused Dependencies Found
  
  **Development Dependencies:**
  - package-name-1 (reason for being unused)
  - package-name-2 (reason for being unused)
  
  **Production Dependencies:**
  - package-name-3 (reason for being unused)
  - package-name-4 (reason for being unused)
  
  **Total Potential Savings:** X packages
  ```

### Step 3: User Confirmation
- Ask user: "Would you like me to automatically remove these unused dependencies from the codebase?"
- Wait for explicit user confirmation before proceeding

### Step 4: Dependency Removal (if confirmed)
- Remove unused dependencies from package.json using Edit tool
- Run `npm install` to update node_modules and package-lock.json
- Confirm successful cleanup
- Report final results to user

## Success Criteria
- Complete codebase analysis performed
- Clear presentation of findings
- User approval obtained before changes
- Clean dependency removal with proper npm cleanup
- Optimized package.json and node_modules

## Notes
- Be thorough in the analysis - scan all TypeScript/JavaScript files
- Consider both direct imports and dynamic requires
- Pay attention to dev vs production dependency classifications
- Always run npm install after package.json changes to maintain consistency