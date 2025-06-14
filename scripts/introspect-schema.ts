#!/usr/bin/env tsx

/**
 * GraphQL Schema Introspection Tool
 * Generates detailed schema information for client developers
 */

const GRAPHQL_URL = 'http://localhost:4000/graphql';

interface SchemaType {
  name: string;
  kind: string;
  description?: string;
  fields?: Array<{
    name: string;
    type: {
      name?: string;
      kind: string;
      ofType?: {
        name?: string;
        kind: string;
      };
    };
    args: Array<{
      name: string;
      type: {
        name?: string;
        kind: string;
      };
    }>;
    description?: string;
  }>;
  enumValues?: Array<{
    name: string;
    description?: string;
  }>;
  inputFields?: Array<{
    name: string;
    type: {
      name?: string;
      kind: string;
    };
    description?: string;
  }>;
}

interface IntrospectionResult {
  __schema: {
    types: SchemaType[];
    queryType: {
      name: string;
      fields: Array<{
        name: string;
        description?: string;
        args: Array<{
          name: string;
          type: {
            name?: string;
            kind: string;
          };
        }>;
      }>;
    };
    mutationType: {
      name: string;
      fields: Array<{
        name: string;
        description?: string;
        args: Array<{
          name: string;
          type: {
            name?: string;
            kind: string;
          };
        }>;
      }>;
    };
    subscriptionType: {
      name: string;
      fields: Array<{
        name: string;
        description?: string;
      }>;
    };
  };
}

async function introspectSchema(): Promise<IntrospectionResult> {
  const query = `
    query IntrospectSchema {
      __schema {
        types {
          name
          kind
          description
          fields {
            name
            description
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
            args {
              name
              type {
                name
                kind
              }
            }
          }
          enumValues {
            name
            description
          }
          inputFields {
            name
            description
            type {
              name
              kind
            }
          }
        }
        queryType {
          name
          fields {
            name
            description
            args {
              name
              type {
                name
                kind
              }
            }
          }
        }
        mutationType {
          name
          fields {
            name
            description
            args {
              name
              type {
                name
                kind
              }
            }
          }
        }
        subscriptionType {
          name
          fields {
            name
            description
          }
        }
      }
    }
  `;

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`GraphQL errors: ${result.errors.map((e: any) => e.message).join(', ')}`);
  }

  return result.data;
}

function formatType(type: any): string {
  if (type.kind === 'NON_NULL') {
    return `${formatType(type.ofType)}!`;
  }
  if (type.kind === 'LIST') {
    return `[${formatType(type.ofType)}]`;
  }
  return type.name || type.kind;
}

function generateTypeDocumentation(types: SchemaType[]): void {
  console.log('# GraphQL Schema Types\n');

  // Filter out built-in GraphQL types
  const customTypes = types.filter(type => 
    !type.name.startsWith('__') && 
    !['String', 'Int', 'Float', 'Boolean', 'ID'].includes(type.name)
  );

  // Object types
  const objectTypes = customTypes.filter(type => type.kind === 'OBJECT');
  if (objectTypes.length > 0) {
    console.log('## Object Types\n');
    objectTypes.forEach(type => {
      console.log(`### ${type.name}`);
      if (type.description) {
        console.log(`${type.description}\n`);
      }
      console.log('```graphql');
      console.log(`type ${type.name} {`);
      type.fields?.forEach(field => {
        const args = field.args.length > 0 
          ? `(${field.args.map(arg => `${arg.name}: ${formatType(arg.type)}`).join(', ')})`
          : '';
        console.log(`  ${field.name}${args}: ${formatType(field.type)}`);
      });
      console.log('}\n```\n');
    });
  }

  // Enum types
  const enumTypes = customTypes.filter(type => type.kind === 'ENUM');
  if (enumTypes.length > 0) {
    console.log('## Enum Types\n');
    enumTypes.forEach(type => {
      console.log(`### ${type.name}`);
      if (type.description) {
        console.log(`${type.description}\n`);
      }
      console.log('```graphql');
      console.log(`enum ${type.name} {`);
      type.enumValues?.forEach(value => {
        console.log(`  ${value.name}`);
      });
      console.log('}\n```\n');
    });
  }

  // Input types
  const inputTypes = customTypes.filter(type => type.kind === 'INPUT_OBJECT');
  if (inputTypes.length > 0) {
    console.log('## Input Types\n');
    inputTypes.forEach(type => {
      console.log(`### ${type.name}`);
      if (type.description) {
        console.log(`${type.description}\n`);
      }
      console.log('```graphql');
      console.log(`input ${type.name} {`);
      type.inputFields?.forEach(field => {
        console.log(`  ${field.name}: ${formatType(field.type)}`);
      });
      console.log('}\n```\n');
    });
  }
}

function generateOperationDocumentation(schema: IntrospectionResult['__schema']): void {
  console.log('# GraphQL Operations\n');

  // Queries
  console.log('## Queries\n');
  schema.queryType.fields.forEach(field => {
    console.log(`### ${field.name}`);
    if (field.description) {
      console.log(`${field.description}\n`);
    }
    console.log('```graphql');
    const args = field.args.length > 0 
      ? `(${field.args.map(arg => `${arg.name}: ${formatType(arg.type)}`).join(', ')})`
      : '';
    console.log(`${field.name}${args}`);
    console.log('```\n');
  });

  // Mutations
  console.log('## Mutations\n');
  schema.mutationType.fields.forEach(field => {
    console.log(`### ${field.name}`);
    if (field.description) {
      console.log(`${field.description}\n`);
    }
    console.log('```graphql');
    const args = field.args.length > 0 
      ? `(${field.args.map(arg => `${arg.name}: ${formatType(arg.type)}`).join(', ')})`
      : '';
    console.log(`${field.name}${args}`);
    console.log('```\n');
  });

  // Subscriptions
  if (schema.subscriptionType) {
    console.log('## Subscriptions\n');
    schema.subscriptionType.fields.forEach(field => {
      console.log(`### ${field.name}`);
      if (field.description) {
        console.log(`${field.description}\n`);
      }
      console.log('```graphql');
      console.log(`${field.name}`);
      console.log('```\n');
    });
  }
}

async function main() {
  try {
    console.log('🔍 Introspecting GraphQL schema...\n');

    const schema = await introspectSchema();
    
    // Generate types documentation
    generateTypeDocumentation(schema.__schema.types);
    
    // Generate operations documentation
    generateOperationDocumentation(schema.__schema);

    console.log('✅ Schema introspection completed!');
    console.log('\n📝 Documentation generated above');
    console.log('📋 Copy this output to create schema reference docs');

  } catch (error) {
    console.error('❌ Introspection failed:', error);
    process.exit(1);
  }
}

main();