Package.json Optimization Analysis

Analyze the package.json file for optimization opportunities including performance improvements, redundancies, and best practices.

You MUST follow these steps:

1. Read the FULL package.json file from the project root

2. Perform comprehensive optimization analysis checking for:
   - Unnecessary `npx` usage for already-installed dependencies
   - Redundant or similar scripts that could be consolidated
   - Script performance optimizations (command chaining, parallel execution)
   - Formatting inconsistencies (indentation, spacing, property order)
   - Standard package.json field optimization:
     - Property ordering (following npm conventions)
     - Script naming conventions and consistency
     - Version range optimization in dependencies
     - Missing beneficial fields (engines, repository info, etc.)
   - Command efficiency improvements:
     - Multiple similar commands that could use shared logic
     - Long command chains that could be broken into reusable scripts
     - Commands that could benefit from npm-run-all or similar tools

3. If NO optimizations are found:
   - Present a nice message stating the package.json is already well-optimized
   - Include a brief summary of what was analyzed

4. If optimizations ARE found:
   - Present each optimization clearly with:
     - Category (Performance, Redundancy, Formatting, Best Practice)
     - Description of the current issue
     - Your suggested optimization with before/after comparison
     - Explanation of the benefit (faster execution, cleaner code, etc.)
   - Group similar optimizations together for clarity
   - Wait for user approval before making ANY changes
   - NEVER edit the package.json without explicit user approval

5. After user approval (if optimizations were found):
   - Implement the approved optimizations
   - Re-read the package.json to verify the changes
   - Present a summary of what was optimized and the expected benefits

6. If the user denies a proposed optimization:
   - Ask for clarification on their preferred approach
   - Work interactively to design an alternative solution

Remember: This command focuses on optimization and efficiency - look for ways to make scripts faster, cleaner, and more maintainable without changing functionality.