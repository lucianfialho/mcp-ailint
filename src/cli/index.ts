#!/usr/bin/env node

import { Command } from 'commander';
import { CodeAnalyzer } from '../shared/analyzer.js';
import { AnalysisOptions } from '../shared/types.js';

const program = new Command();
const analyzer = new CodeAnalyzer();

program
  .name('ailint')
  .description('AILint - AI-powered code quality analysis')
  .version('1.0.0');

program
  .command('analyze <file>')
  .description('Analyze a code file')
  .option('-l, --language <lang>', 'specify programming language')
  .option('-r, --rulesets <rulesets...>', 'additional rulesets to apply')
  .action(async (file: string, options: any) => {
    // console.log(` Analyzing ${file}...`);
        // console.log('CLI implementation coming soon!');
    
    // Future CLI implementation would:
    // 1. Read file content
    // 2. Call analyzer.analyze()
    // 3. Format output for terminal
  });

program
  .command('rules')
  .description('List available rules')
  .action(async () => {
        // console.log(' Available rules:');
        // console.log('CLI implementation coming soon!');
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export { program };
