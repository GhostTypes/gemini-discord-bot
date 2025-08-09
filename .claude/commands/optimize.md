Interactive codebase optimization

Optimize the codebase with optional focus area: #$ARGUMENTS

First, use `npm run linecount` to see the amount of lines in all source files in the codebase

Anything under 512 lines can be ignored (but consider files that are nearing this "limit")

Then use the code context provider tool to get an overview of the codebase, where larger files are located, and their relations in the codebase

For "main" classes, we can allow up to 1024 lines, but it is best that nothing exceeds this limit unless under special circumstances

Once you have a list of classes violating either of these rules and an understanding of their relations in the codebase, delegate further analysis to the `systems-architect`
sub-agent, have it focus on areas for optimization (meaning reducing the amount of code in these large files) and code deduplication 
(meaning reducing the amount of "duplicate" code or very similar code in these larger files)

Once you get the data back from the `systems-architect` sub-agent, present a polished & formal report to the user. You will work interactive with the user to decide the best course of action
Until the user explicitly tells you to begin any work, you CANNOT change any files, and MUST make sure the `systems-architect` sub-agent is aware of this

When working interactively with the user , it is best both of you focus on one thing at a time - doing too many changes at once without testing can easily break things
You must also be VERY careful to NEVER break any features or functionality

You or the `systems-architect` sub-agent should NEVER include "timelines" in any of the planning, things like :
	- Week 1 : XYZ
	- Week 2 : ABC

You need to present ALL data and work INTERACTIVELY with the user to pick something to focus on, it's best to ALWAYS suggest the easiest thing (for you to work on) that yields the best cleanup/reduction