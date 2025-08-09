Package.json Structure and Format Validation

Analyze the package.json file for structure, formatting, and syntax issues.

You MUST follow these steps:

1. Read the FULL package.json file from the project root

2. Perform comprehensive analysis checking for:
   - JSON syntax errors (missing commas, brackets, quotes)
   - Property structure issues (incorrect nesting, duplicate keys)
   - Formatting inconsistencies (indentation, spacing)
   - Standard package.json field validation:
     - Required fields (name, version)
     - Proper semver format for version numbers
     - Valid dependency version ranges
     - Correct script command syntax
     - Proper repository, author, license format
   - Dependency organization (dependencies vs devDependencies vs peerDependencies)
   - Unused or conflicting dependency versions
   - Missing or malformed fields that could cause npm/package manager issues

3. If NO issues are found:
   - Present a nice message stating the package.json doesn't need any adjustment
   - Include a brief summary of what was validated

4. If issues ARE found:
   - Present each issue clearly with:
     - Description of the problem
     - Location in the file (line/property if applicable)
     - Your suggested fix with before/after comparison
     - Explanation of why the fix is needed
   - Wait for user approval before making ANY changes
   - NEVER edit the package.json without explicit user approval

5. After user approval (if issues were found):
   - Implement the approved fixes
   - Re-read the package.json to verify the changes
   - Present a summary of what was fixed

6. If the user denies a proposed fix:
   - Ask for clarification on their preferred approach
   - Work interactively to design an alternative solution

Remember: This command is diagnostic and corrective - focus on structural integrity and standards compliance, not feature additions or major reorganization.