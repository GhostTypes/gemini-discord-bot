/**
 * @fileoverview Standalone prompt injection testing framework.
 * 
 * This module provides an isolated testing environment for validating the bot's
 * system prompt resilience against prompt injection attacks. It replicates the
 * core conversational flow without Discord dependencies.
 * 
 * Key Features:
 * - Standalone execution with direct AI client integration
 * - Test case configuration with flexible validation rules
 * - Batch and individual test execution capabilities
 * - Detailed reporting with pass/fail summaries
 * - Support for multiple validation assertion types
 * 
 * Usage:
 * Run directly with tsx: `npx tsx src/testing/test-prompt-injection.ts`
 * Or compile and run: `tsc && node dist/testing/test-prompt-injection.js`
 */

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { botConfig } from '../config/environment.js';
import { GenerationConfigBuilder } from '../utils/GenerationConfigBuilder.js';
import { logger } from '../utils/logger.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SafetyEvaluator } from './safety-evaluator.js';
import { getSystemPrompt } from '../utils/systemPrompt.js';

// Initialize AI client identical to main bot
const ai = genkit({
  plugins: [
    googleAI({
      apiKey: botConfig.google.apiKey,
    }),
  ],
  model: googleAI.model(botConfig.google.model),
});

// Test case interfaces
interface TestCase {
  name: string;
  input: string;
  expectedBehavior: string;
  tags?: string[];
  description?: string;
}

interface TestResult {
  testCase: TestCase;
  response: string;
  passed: boolean;
  reasoning: string;
  confidence: string;
  riskLevel: string;
  duration: number;
}

class PromptInjectionTester {
  private testCases: TestCase[] = [];
  private safetyEvaluator: SafetyEvaluator;

  constructor() {
    this.loadTestCases();
    this.safetyEvaluator = new SafetyEvaluator();
  }

  private loadTestCases(): void {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const testCasesPath = join(__dirname, 'test-cases.json');
      const testCasesData = readFileSync(testCasesPath, 'utf-8');
      this.testCases = JSON.parse(testCasesData);
      console.log(`Loaded ${this.testCases.length} test cases`);
    } catch (error) {
      console.error('Failed to load test cases:', error);
      this.testCases = [];
    }
  }

  private async generateResponse(input: string): Promise<string> {
    // Use proper system instruction separation
    const systemPrompt = getSystemPrompt();

    try {
      const { stream } = await ai.generateStream({
        prompt: `User message: ${input}`,
        system: systemPrompt,
        config: GenerationConfigBuilder.build(),
      });

      let fullResponse = '';
      for await (const chunk of stream) {
        // Filter out thinking chunks, only process final response text
        const chunkAny = chunk as any;
        if (chunk.text && !chunkAny.thoughts) {
          fullResponse += chunk.text;
        }
      }

      return fullResponse || 'Sorry, I couldn\'t generate a response.';
    } catch (error) {
      logger.error('Failed to generate response:', error);
      return `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async evaluateResponse(testCase: TestCase, response: string) {
    try {
      const evaluation = await this.safetyEvaluator.evaluateResponse({
        testName: testCase.name,
        testDescription: testCase.description || testCase.name,
        attackPrompt: testCase.input,
        botResponse: response,
        expectedBehavior: testCase.expectedBehavior,
      });

      return evaluation;
    } catch (error) {
      console.error('Safety evaluation failed:', error);
      return {
        passed: false,
        reasoning: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 'low',
        riskLevel: 'high',
      };
    }
  }

  async runTest(testCase: TestCase): Promise<TestResult> {
    console.log(`\n🧪 Running: ${testCase.name}`);
    if (testCase.description) {
      console.log(`   ${testCase.description}`);
    }

    const startTime = Date.now();
    const response = await this.generateResponse(testCase.input);
    console.log(`   🔍 Evaluating safety...`);
    
    const evaluation = await this.evaluateResponse(testCase, response);
    const duration = Date.now() - startTime;

    const result: TestResult = {
      testCase,
      response,
      passed: evaluation.passed,
      reasoning: evaluation.reasoning,
      confidence: evaluation.confidence,
      riskLevel: evaluation.riskLevel,
      duration,
    };

    // Log result
    if (evaluation.passed) {
      console.log(`   ✅ PASSED (${duration}ms) - Confidence: ${evaluation.confidence}`);
    } else {
      console.log(`   ❌ FAILED (${duration}ms) - Risk: ${evaluation.riskLevel}, Confidence: ${evaluation.confidence}`);
      console.log(`      Reasoning: ${evaluation.reasoning}`);
    }

    return result;
  }

  async runAllTests(tagFilter?: string): Promise<void> {
    console.log('🚀 Starting Prompt Injection Test Suite');
    console.log('========================================');

    let filteredTests = this.testCases;
    if (tagFilter) {
      filteredTests = this.testCases.filter(tc => 
        tc.tags?.some(tag => tag.toLowerCase().includes(tagFilter.toLowerCase()))
      );
      console.log(`Filtering by tag: "${tagFilter}" (${filteredTests.length} tests)`);
    }

    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const testCase of filteredTests) {
      const result = await this.runTest(testCase);
      results.push(result);
      
      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
    }

    // Summary
    console.log('\n📊 Test Summary');
    console.log('================');
    console.log(`Total tests: ${results.length}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Success rate: ${((passed / results.length) * 100).toFixed(1)}%`);

    // Show failed test details
    const failedResults = results.filter(r => !r.passed);
    if (failedResults.length > 0) {
      console.log('\n❌ Failed Tests Details');
      console.log('========================');
      
      for (const result of failedResults) {
        console.log(`\nTest: ${result.testCase.name}`);
        console.log(`Risk Level: ${result.riskLevel}`);
        console.log(`Confidence: ${result.confidence}`);
        console.log(`Input: ${result.testCase.input}`);
        console.log(`Response: ${result.response.substring(0, 200)}${result.response.length > 200 ? '...' : ''}`);
        console.log(`Reasoning: ${result.reasoning}`);
      }
    }

    process.exit(failed > 0 ? 1 : 0);
  }

  async runSingleTest(testName: string): Promise<void> {
    const testCase = this.testCases.find(tc => tc.name.toLowerCase().includes(testName.toLowerCase()));
    
    if (!testCase) {
      console.error(`❌ Test not found: "${testName}"`);
      console.log('Available tests:');
      this.testCases.forEach(tc => console.log(`  - ${tc.name}`));
      process.exit(1);
    }

    console.log('🚀 Running Single Test');
    console.log('======================');

    const result = await this.runTest(testCase);
    
    console.log('\n📋 Full Response:');
    console.log(result.response);
    
    console.log('\n📊 Safety Evaluation:');
    console.log(`  Result: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Risk Level: ${result.riskLevel}`);
    console.log(`  Confidence: ${result.confidence}`);
    console.log(`  Reasoning: ${result.reasoning}`);

    process.exit(result.passed ? 0 : 1);
  }
}

// CLI execution logic
async function main() {
  const args = process.argv.slice(2);
  const tester = new PromptInjectionTester();

  if (args.length === 0) {
    // Run all tests
    await tester.runAllTests();
  } else if (args[0] === '--tag' && args[1]) {
    // Run tests by tag
    await tester.runAllTests(args[1]);
  } else if (args[0] === '--test' && args[1]) {
    // Run single test
    await tester.runSingleTest(args[1]);
  } else {
    console.log('Usage:');
    console.log('  npx tsx src/testing/test-prompt-injection.ts                    # Run all tests');
    console.log('  npx tsx src/testing/test-prompt-injection.ts --tag injection    # Run tests with tag');
    console.log('  npx tsx src/testing/test-prompt-injection.ts --test "test name" # Run specific test');
    process.exit(1);
  }
}

// Always run when executed
main().catch(console.error);