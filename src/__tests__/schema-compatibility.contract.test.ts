/**
 * Schema Compatibility Contract Tests
 *
 * These tests validate that GraphQL queries used by frontend and MCP clients
 * are compatible with the backend schema. This catches contract violations
 * before they reach production.
 */

import { parse, validate, GraphQLSchema } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from '../graphql/schema';
import fs from 'fs';
import path from 'path';

describe('GraphQL Schema Compatibility', () => {
  let schema: GraphQLSchema;

  beforeAll(() => {
    schema = makeExecutableSchema({ typeDefs });
  });

  describe('Frontend Queries', () => {
    const frontendQueriesDir = path.join(__dirname, '../../../lacylights-fe/src/graphql');

    // Only run if frontend directory exists (might not in isolated test environments)
    if (fs.existsSync(frontendQueriesDir)) {
      const files = fs.readdirSync(frontendQueriesDir)
        .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));

      if (files.length === 0) {
        it('should have frontend query files to validate', () => {
          expect(files.length).toBeGreaterThan(0);
        });
      }

      files.forEach(file => {
        it(`should validate all queries in ${file}`, () => {
          const filePath = path.join(frontendQueriesDir, file);
          const content = fs.readFileSync(filePath, 'utf8');

          // Extract all gql`` template strings
          const queries = extractGraphQLQueries(content);

          if (queries.length === 0) {
            // File might not have queries, that's okay
            return;
          }

          queries.forEach((query, index) => {
            try {
              const documentAST = parse(query);
              const errors = validate(schema, documentAST);

              if (errors.length > 0) {
                console.error(`Query ${index} in ${file} validation errors:`, errors);
              }

              expect(errors).toHaveLength(0);
            } catch (error) {
              console.error(`Failed to parse query ${index} in ${file}:`, error);
              throw error;
            }
          });
        });
      });
    } else {
      it('should skip frontend validation when frontend directory not available', () => {
        console.log('Skipping frontend query validation - directory not found');
        expect(true).toBe(true);
      });
    }
  });

  describe('MCP Queries', () => {
    const mcpClientPath = path.join(__dirname, '../../../lacylights-mcp/src/services/graphql-client-simple.ts');

    if (fs.existsSync(mcpClientPath)) {
      it('should validate all MCP queries', () => {
        const content = fs.readFileSync(mcpClientPath, 'utf8');
        const queries = extractGraphQLQueries(content);

        expect(queries.length).toBeGreaterThan(0);

        queries.forEach((query, index) => {
          try {
            const documentAST = parse(query);
            const errors = validate(schema, documentAST);

            if (errors.length > 0) {
              console.error(`MCP query ${index} validation errors:`, errors);
            }

            expect(errors).toHaveLength(0);
          } catch (error) {
            console.error(`Failed to parse MCP query ${index}:`, error);
            throw error;
          }
        });
      });
    } else {
      it('should skip MCP validation when MCP directory not available', () => {
        console.log('Skipping MCP query validation - directory not found');
        expect(true).toBe(true);
      });
    }
  });

  describe('Schema Structure', () => {
    it('should have Query type', () => {
      const queryType = schema.getQueryType();
      expect(queryType).toBeDefined();
      expect(queryType?.name).toBe('Query');
    });

    it('should have Mutation type', () => {
      const mutationType = schema.getMutationType();
      expect(mutationType).toBeDefined();
      expect(mutationType?.name).toBe('Mutation');
    });

    it('should have Subscription type', () => {
      const subscriptionType = schema.getSubscriptionType();
      expect(subscriptionType).toBeDefined();
      expect(subscriptionType?.name).toBe('Subscription');
    });

    it('should have core types defined', () => {
      const typeMap = schema.getTypeMap();

      // Check for core business types
      expect(typeMap['Project']).toBeDefined();
      expect(typeMap['FixtureInstance']).toBeDefined();
      expect(typeMap['Scene']).toBeDefined();
      expect(typeMap['CueList']).toBeDefined();
      expect(typeMap['Cue']).toBeDefined();
    });
  });
});

/**
 * Extract GraphQL queries from gql`` template strings or inline strings
 */
function extractGraphQLQueries(fileContent: string): string[] {
  const queries: string[] = [];

  // Match gql`` template strings (used by frontend with Apollo)
  const gqlRegex = /gql`([\s\S]*?)`/g;
  let match;

  while ((match = gqlRegex.exec(fileContent)) !== null) {
    queries.push(match[1].trim());
  }

  // Match inline GraphQL strings (used by MCP client)
  // Look for strings that start with "query", "mutation", or "subscription"
  const inlineRegex = /["`]((?:query|mutation|subscription)\s+[\s\S]*?)["`]/gi;

  while ((match = inlineRegex.exec(fileContent)) !== null) {
    const query = match[1].trim();
    // Avoid duplicates from gql`` matches
    if (!queries.includes(query)) {
      queries.push(query);
    }
  }

  // Also check for multiline strings with GraphQL operations
  const multilineRegex = /`\s*((?:query|mutation|subscription)\s+[\s\S]*?)`/gi;

  while ((match = multilineRegex.exec(fileContent)) !== null) {
    const query = match[1].trim();
    if (!queries.includes(query)) {
      queries.push(query);
    }
  }

  return queries;
}
