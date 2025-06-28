import * as fs from 'fs/promises';
import * as path from 'path';
import { Rule } from '../shared/schemas.js';

export class ProjectConfigManager {
  private static IDE_CONFIG_BASE_DIR = '.ailint';

  /**
   * Creates IDE-specific configuration files and directory structure.
   * @param projectRoot The root directory of the user's project.
   * @param rules The rules to be included in the configuration.
   * @param ideType The type of IDE (e.g., 'cursor', 'vscode').
   */
  public static async createIDEConfiguration(
    projectRoot: string,
    rules: Rule[],
    ideType: 'cursor' | 'vscode'
  ): Promise<void> {
    const configPath = path.join(projectRoot, ProjectConfigManager.IDE_CONFIG_BASE_DIR);
        // console.log(` Creating IDE configuration at: ${configPath}`);

    try {
      // 1. Create directory structure
      await fs.mkdir(configPath, { recursive: true });

      // Define paths for rules and IDE-specific config
      const rulesDir = path.join(configPath, 'rules');
      await fs.mkdir(rulesDir, { recursive: true });

      // 2. Write rule files organized by category
      for (const rule of rules) {
        const ruleFilePath = path.join(rulesDir, `${rule.id}.json`);
        await fs.writeFile(ruleFilePath, JSON.stringify(rule, null, 2));
                // console.log(`  Wrote rule: ${rule.id}.json`);
      }

      // 3. Create IDE-specific configuration files
      let ideConfigFileContent: string;
      switch (ideType) {
        case 'cursor':
          ideConfigFileContent = JSON.stringify({
            "ailint.rulesPath": `./${ProjectConfigManager.IDE_CONFIG_BASE_DIR}/rules`,
            "ailint.autoAttach": true
          }, null, 2);
          await fs.writeFile(path.join(configPath, 'cursor.json'), ideConfigFileContent);
                    // console.log(`  Wrote Cursor IDE config: cursor.json`);
          break;
        case 'vscode':
          ideConfigFileContent = JSON.stringify({
            "ailint.rulesPath": `./${ProjectConfigManager.IDE_CONFIG_BASE_DIR}/rules`,
            "ailint.autoAttach": true
          }, null, 2);
          await fs.writeFile(path.join(configPath, 'vscode.json'), ideConfigFileContent);
                    // console.log(`  Wrote VSCode IDE config: vscode.json`);
          break;
        default:
                  // console.warn(`Unsupported IDE type: ${ideType}. Skipping IDE-specific configuration.`);
      }

      // 4. Set up auto-attach mechanisms (conceptual, depends on IDE extension capabilities)
            // console.log(`  Auto-attach setup for ${ideType} (conceptual - requires IDE extension support).`);

            // console.log(`✅ Successfully created AILint configuration for ${ideType} at ${configPath}`);
    } catch (error) {
          // console.error(`❌ Failed to create IDE configuration at ${configPath}:`, error);
      throw error; // Re-throw to propagate the error
    }
  }
}
