import { ApolloServer } from '@apollo/server';
import { typeDefs } from '../schema';
import { resolvers } from '../resolvers';
import { PrismaClient } from '@prisma/client';
import { Context } from '../../context';

describe('Project GraphQL Resolvers', () => {
  let server: ApolloServer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    server = new ApolloServer({
      typeDefs,
      resolvers,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.projectUser.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
  });

  const createTestContext = (): Context => ({
    prisma,
    req: {} as any,
    res: {} as any,
  });

  describe('Query.projects', () => {
    it('should return empty array when no projects exist', async () => {
      const response = await server.executeOperation(
        {
          query: `
            query {
              projects {
                id
                name
                description
              }
            }
          `,
        },
        {
          contextValue: createTestContext(),
        }
      );

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.projects).toEqual([]);
      }
    });

    it('should return projects when they exist', async () => {
      // Create test project
      const testProject = await prisma.project.create({
        data: {
          name: 'Test Project',
          description: 'A test project',
        },
      });

      const response = await server.executeOperation(
        {
          query: `
            query {
              projects {
                id
                name
                description
              }
            }
          `,
        },
        {
          contextValue: createTestContext(),
        }
      );

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.projects).toHaveLength(1);
        expect(response.body.singleResult.data?.projects[0]).toMatchObject({
          id: testProject.id,
          name: 'Test Project',
          description: 'A test project',
        });
      }
    });
  });

  describe('Query.project', () => {
    it('should return project by id', async () => {
      const testProject = await prisma.project.create({
        data: {
          name: 'Test Project',
          description: 'A test project',
        },
      });

      const response = await server.executeOperation(
        {
          query: `
            query GetProject($id: ID!) {
              project(id: $id) {
                id
                name
                description
              }
            }
          `,
          variables: { id: testProject.id },
        },
        {
          contextValue: createTestContext(),
        }
      );

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.project).toMatchObject({
          id: testProject.id,
          name: 'Test Project',
          description: 'A test project',
        });
      }
    });

    it('should return null for non-existent project', async () => {
      const response = await server.executeOperation(
        {
          query: `
            query GetProject($id: ID!) {
              project(id: $id) {
                id
                name
              }
            }
          `,
          variables: { id: 'non-existent-id' },
        },
        {
          contextValue: createTestContext(),
        }
      );

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.project).toBeNull();
      }
    });
  });

  describe('Mutation.createProject', () => {
    it('should create a new project', async () => {
      const response = await server.executeOperation(
        {
          query: `
            mutation CreateProject($input: CreateProjectInput!) {
              createProject(input: $input) {
                id
                name
                description
              }
            }
          `,
          variables: {
            input: {
              name: 'New Project',
              description: 'A new test project',
            },
          },
        },
        {
          contextValue: createTestContext(),
        }
      );

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.createProject).toMatchObject({
          name: 'New Project',
          description: 'A new test project',
        });
        expect(response.body.singleResult.data?.createProject.id).toBeDefined();
      }

      // Verify project was created in database
      const projects = await prisma.project.findMany();
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe('New Project');
    });

    it('should create project without description', async () => {
      const response = await server.executeOperation(
        {
          query: `
            mutation CreateProject($input: CreateProjectInput!) {
              createProject(input: $input) {
                id
                name
                description
              }
            }
          `,
          variables: {
            input: {
              name: 'Project Without Description',
            },
          },
        },
        {
          contextValue: createTestContext(),
        }
      );

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.createProject).toMatchObject({
          name: 'Project Without Description',
          description: null,
        });
      }
    });
  });

  describe('Mutation.updateProject', () => {
    it('should update existing project', async () => {
      const testProject = await prisma.project.create({
        data: {
          name: 'Original Name',
          description: 'Original description',
        },
      });

      const response = await server.executeOperation(
        {
          query: `
            mutation UpdateProject($id: ID!, $input: CreateProjectInput!) {
              updateProject(id: $id, input: $input) {
                id
                name
                description
              }
            }
          `,
          variables: {
            id: testProject.id,
            input: {
              name: 'Updated Name',
              description: 'Updated description',
            },
          },
        },
        {
          contextValue: createTestContext(),
        }
      );

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.updateProject).toMatchObject({
          id: testProject.id,
          name: 'Updated Name',
          description: 'Updated description',
        });
      }
    });
  });

  describe('Mutation.deleteProject', () => {
    it('should delete existing project', async () => {
      const testProject = await prisma.project.create({
        data: {
          name: 'Project to Delete',
          description: 'This project will be deleted',
        },
      });

      const response = await server.executeOperation(
        {
          query: `
            mutation DeleteProject($id: ID!) {
              deleteProject(id: $id)
            }
          `,
          variables: { id: testProject.id },
        },
        {
          contextValue: createTestContext(),
        }
      );

      expect(response.body.kind).toBe('single');
      if (response.body.kind === 'single') {
        expect(response.body.singleResult.errors).toBeUndefined();
        expect(response.body.singleResult.data?.deleteProject).toBe(true);
      }

      // Verify project was deleted from database
      const projects = await prisma.project.findMany();
      expect(projects).toHaveLength(0);
    });
  });
});