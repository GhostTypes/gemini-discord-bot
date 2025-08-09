# Optimize AI Files Command

## Objective
Detect AI-generated files in the root workspace and organize them into appropriate locations within the AI_FILES folder structure.

## Critical Rules
- **NEVER** move CLAUDE.md
- **NEVER** use the AI_DOCS folder (reserved for documentation sub-agent's local knowledge base)
- **ALWAYS** use AI_FILES folder for organization
- **MUST** present organized list to user before making any changes
- **MUST** read first 50-100 lines of each suspected file to understand content

## Execution Steps

### Step 1: Scan Root Directory
- Use LS tool to list all files in the root directory
- Filter for files that might be AI-generated (look for patterns like):
  - Files with "AI", "GPT", "Claude", "generated", "design", "spec", "analysis" in names
  - Markdown files (.md) that aren't standard project files
  - Text files (.txt) with descriptive names
  - Files with timestamps or version numbers in names

### Step 2: Thorough Content Analysis & Deletion Assessment
For each suspected AI-generated file:
- Use Read tool to analyze **ENTIRE FILE CONTENT** (do not limit lines - read complete files)
- Perform deep analysis to determine file relevance and completion status
- Categorize based on content type:
  - **Development**: Progress tracking, todo lists, development notes, logs
  - **Design**: Game designs, feature specifications, architectural plans
  - **Analysis**: Code analysis, research, comparisons, evaluations
  - **Documentation**: Generated docs, guides, explanations (not CLAUDE.md)
  - **Data**: Generated datasets, configurations, templates

**Critical Deletion Assessment**
For each file, perform detailed investigation to determine if it should be **DELETED** rather than moved:

**High Priority Deletion Indicators**:
- **Completed Development Plans**: Files with majority/all checkboxes completed (✓, [x], DONE)
- **Implemented Features**: Design specs for features that are already fully implemented in codebase
- **Obsolete Requirements**: Planning documents for systems that are already built and working
- **Outdated Analysis**: Analysis of legacy code that has been replaced/rewritten
- **Temporary Scratch Work**: Files that appear to be working notes or brainstorming
- **Duplicate Information**: Content that's already captured in CLAUDE.md or other permanent docs

**Investigation Requirements**:
1. **Count completion markers**: How many tasks are marked complete vs. incomplete?
2. **Cross-reference with codebase**: Does the current codebase already implement what the file describes?
3. **Check timestamps and context**: Is this from an earlier phase of development that's now complete?
4. **Assess ongoing value**: Would keeping this file provide any future benefit?

**Deletion Criteria - Be Aggressive**:
- **>80% task completion**: If most tasks in a development file are done, DELETE
- **Fully implemented features**: If a design spec describes features that exist in current code, DELETE  
- **Legacy system analysis**: If analyzing old code that's been replaced, DELETE
- **Working notes/scratch**: If appears to be temporary work product, DELETE
- **Outdated planning**: If planning documents for completed systems, DELETE

### Step 3: Dynamic Organization Structure
Create appropriate subfolders in AI_FILES based on actual content found. Suggested categories include:
- `development/` - Development tracking files
- `design/` - Design documents and specifications  
- `analysis/` - Analysis and research files
- `documentation/` - Generated documentation
- `data/` - Generated data files
- `misc/` - Other AI-generated content

**Note**: You have full flexibility to create any subfolder structure that makes sense for the specific files found. Adapt the organization to fit the actual content discovered, including creating new categories or nested subfolders as needed.

### Step 4: Present Detailed Analysis and Plan
Before making any changes, present a comprehensive analysis with specific reasoning:
```
## Proposed File Organization

**Files Recommended for DELETION:**
- filename1.md (Reason: 15/17 tasks completed ✓, remaining tasks already implemented)
- old-plan.txt (Reason: Describes game system that is 100% implemented in current codebase)
- legacy-analysis.md (Reason: Analysis of old code that has been completely rewritten)

**Files to Move:**
**Development Files:**
- active-dev.md -> AI_FILES/development/ (Reason: Contains ongoing development tasks, 3/12 incomplete)

**Design Files:**
- future-feature.md -> AI_FILES/design/ (Reason: Describes unimplemented feature for future phases)

**Analysis Files:**
- current-analysis.md -> AI_FILES/analysis/ (Reason: Active analysis of current system)

**Files to Keep in Current Location:**
- CLAUDE.md (Project instructions - never moved)
- README.md (Standard project documentation)
```

**Analysis Summary:**
For each file, provide specific reasoning based on:
- Completion percentage (count actual checkmarks/tasks)
- Implementation status in current codebase
- Relevance to current development phase
- Whether information is duplicated elsewhere

### Step 5: Execute or Inform
- If files found: Wait for user approval, then execute moves/deletions using Bash tool
- If no files found: Politely inform user that no AI-generated files were detected in root
- For deletion suggestions: Clearly explain reasoning and wait for explicit user confirmation

## Success Criteria
- **Primary Goal**: Delete completed/obsolete files rather than just organizing them
- All remaining AI-generated files properly categorized and moved
- Completed development plans and implemented features DELETED (not moved)
- CLAUDE.md remains untouched
- AI_DOCS folder remains untouched
- User has clear visibility into all changes before execution
- Well-organized AI_FILES structure created with logical subfolder arrangement
- **Specific quantitative analysis** provided for each deletion recommendation
- Aggressive deletion approach prioritizing workspace cleanliness over file preservation