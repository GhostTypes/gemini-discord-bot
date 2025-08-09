Interactive bugfixing

You need to find and fix the bug the user described: #$ARGUMENTS

You MUST follow these steps:
1. Understand the issue described by the user , ask any clarifying questions needed before you begin any analysis work. It's best to have a clear picture of the issue with any supporting data,
like screenshots and logs. If the user cannot provide these, it's okay to move on, but you should generally ask unless you are confident you understand the issue described.
2. Locate the code responsible for the issue described by the user (what class has the logic they describe as flawed, or is throwing an error, etc - you are not expected to just *know* what
code is responsible immediatly, but you need to find the correct area in the codebase to search). Use the code context provider tool to get comprehensive information about anywhere in the codebase
3. Use your cognative tools to analyze the situation and locate the root cause (first pass):
	- Use sequential-thinking
	- Use gemini_collaborate (provide all needed context, this is a persistent session and you can create new ones as needed)
4. After locating the root cause , use your cognative tools again, this time to create a solution that addresses the *root cause*, no band-aid fixes, or hot fixes. (second pass)
	- Use sequential-thinking
	- Use gemini_collaborate (provide all needed context, this is a persistent session and you can create new ones as needed)
5. Inform the user of the located root cause, and what you have come up with to address it. Once approved, implement the fix. 
If the user denies and asks you to change XYZ, simply do that and continue, otherwise you MUST repeat steps 3-4 and work interactively with them to design a new fix (after finding a **new** root cause)