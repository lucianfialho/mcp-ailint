import { Rule } from './schemas.js';

export class RuleParser {
  /**
   * Parses a single MDC (Markdown Code) rule content.
   * @param content The markdown content of the rule.
   * @param filename The filename of the rule, used for context.
   * @returns A parsed Rule object.
   */
  static parseMDC(content: string, filename: string): Rule {
    const { frontmatter, content: markdownContent } = RuleParser.extractFrontmatter(content);
    const parsedFrontmatter = RuleParser.parseSimpleYaml(frontmatter);

    // Basic validation for required fields
    if (!parsedFrontmatter.id || !parsedFrontmatter.name || !parsedFrontmatter.category || !parsedFrontmatter.severity) {
      throw new Error(`Missing required frontmatter fields in ${filename}`);
    }

    const explanation = RuleParser.extractExplanation(markdownContent);
    const suggestion = RuleParser.extractSuggestion(markdownContent);

    return {
      id: parsedFrontmatter.id,
      name: parsedFrontmatter.name,
      category: parsedFrontmatter.category,
      severity: parsedFrontmatter.severity,
      description: parsedFrontmatter.description || '',
      // Ensure patterns are always an array
      patterns: Array.isArray(parsedFrontmatter.patterns) ? parsedFrontmatter.patterns : (parsedFrontmatter.patterns ? [parsedFrontmatter.patterns] : []),
      explanation: explanation || parsedFrontmatter.explanation || '',
      suggestion: suggestion || parsedFrontmatter.suggestion || '',
      // Add other fields from frontmatter if they exist in the Rule schema
      ...parsedFrontmatter
    };
  }

  /**
   * Parses a batch of MDC rule contents.   * @param files An array of objects containing filename and content.   * @returns An array of parsed Rule objects.   */  static parseBatch(files: Array<{ filename: string; content: string }>): Rule[] {
    return files.map(file => {
      try {
        return RuleParser.parseMDC(file.content, file.filename);
      } catch (error) {
                // console.error(`Error parsing rule ${file.filename}:`, error);
        return null; // Return null for failed parses, filter out later
      }
    }).filter(rule => rule !== null) as Rule[];
  }

  /**
   * Extracts YAML frontmatter and the remaining content from a markdown string.   * @param content The full markdown content.   * @returns An object containing the frontmatter string and the remaining content.   */  private static extractFrontmatter(content: string): { frontmatter: string; content: string } {
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)/);
    if (frontmatterMatch && frontmatterMatch[1] && frontmatterMatch[2]) {
      return { frontmatter: frontmatterMatch[1].trim(), content: frontmatterMatch[2].trim() };
    }
    return { frontmatter: '', content: content.trim() };
  }

  /**
   * Parses a simple YAML string into a JavaScript object.   * Supports key-value pairs and simple arrays.   * @param yaml The YAML string.   * @returns A JavaScript object.   */  private static parseSimpleYaml(yaml: string): any {
    const result: { [key: string]: any } = {};
    const lines = yaml.split('\n');

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine === '') return;

      const colonIndex = trimmedLine.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmedLine.substring(0, colonIndex).trim();
        let value = trimmedLine.substring(colonIndex + 1).trim();

        // Handle simple arrays (e.g., patterns: [pattern1, pattern2])
        if (value.startsWith('[') && value.endsWith(']')) {
          try {
            result[key] = JSON.parse(value.replace(/([a-zA-Z0-9_]+)/g, '"$1"')); // Basic attempt to make it valid JSON for parsing
          } catch (e) {
            // Fallback to string if JSON.parse fails
            result[key] = value;
          }
        } else if (value.toLowerCase() === 'true') {
          result[key] = true;
        } else if (value.toLowerCase() === 'false') {
          result[key] = false;
        } else if (!isNaN(Number(value)) && !isNaN(parseFloat(value))) {
          result[key] = Number(value);
        } else {
          // Remove quotes if present
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          }
          result[key] = value;
        }
      }
    });
    return result;
  }

  /**
   * Extracts the explanation section from markdown content.   * Assumes explanation is under a heading like '## Explanation' or '### Explanation'.   * @param content The markdown content.   * @returns The explanation string or undefined if not found.   */  private static extractExplanation(content: string): string | undefined {
    const match = content.match(/^(?:##+|#+)\s*Explanation\s*\n([\s\S]*?)(?:\n(?:##+|#+)\s*|$)/i);
    return match ? match[1].trim() : undefined;
  }

  /**
   * Extracts the suggestion section from markdown content.   * Assumes suggestion is under a heading like '## Suggestion' or '### Suggestion'.   * @param content The markdown content.   * @returns The suggestion string or undefined if not found.   */  private static extractSuggestion(content: string): string | undefined {
    const match = content.match(/^(?:##+|#+)\s*Suggestion\s*\n([\s\S]*?)(?:\n(?:##+|#+)\s*|$)/i);
    return match ? match[1].trim() : undefined;
  }
}
