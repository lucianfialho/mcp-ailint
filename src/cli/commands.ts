// Placeholder for future CLI commands
export interface CLICommand {
  name: string;
  description: string;
  execute: (args: any) => Promise<void>;
}

export const commands: CLICommand[] = [
  {
    name: 'analyze',
    description: 'Analyze code files',
    execute: async (args) => {
      // console.log('Analyze command - implementation coming soon');
    }
  },
  {
    name: 'rules',
    description: 'List available rules',
    execute: async (args) => {
      // console.log('Rules command - implementation coming soon');
    }
  }
];
