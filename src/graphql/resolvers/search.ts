import { Context } from "../../context";
import { FixtureType } from "../../types/enums";

/**
 * Search-specific input types
 */
interface SearchFixturesArgs {
  projectId: string;
  query: string;
  filter?: {
    type?: FixtureType;
    universe?: number;
    tags?: string[];
    manufacturer?: string;
    model?: string;
  };
  page?: number;
  perPage?: number;
}

interface SearchScenesArgs {
  projectId: string;
  query: string;
  filter?: {
    nameContains?: string;
    usesFixture?: string;
  };
  page?: number;
  perPage?: number;
}

interface SearchCuesArgs {
  cueListId: string;
  query: string;
  page?: number;
  perPage?: number;
}

/**
 * Search resolvers for fixtures, scenes, and cues
 * Implements case-insensitive text search across multiple fields
 */
export const searchResolvers = {
  Query: {
    /**
     * Search fixtures by name, manufacturer, or model
     * Combines search query with optional filters
     */
    searchFixtures: async (
      _: unknown,
      args: SearchFixturesArgs,
      { prisma }: Context,
    ) => {
      const { projectId, query, page = 1, perPage = 50 } = args;

      // Validate and normalize pagination parameters
      const normalizedPage = Math.max(1, page);
      const normalizedPerPage = Math.min(100, Math.max(1, perPage));
      const skip = (normalizedPage - 1) * normalizedPerPage;
      const take = normalizedPerPage;

      // Build where clause with search conditions
      const where: Record<string, unknown> = {
        projectId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { manufacturer: { contains: query, mode: "insensitive" } },
          { model: { contains: query, mode: "insensitive" } },
        ],
      };

      // Apply additional filters if provided
      if (args.filter) {
        const andConditions: Record<string, unknown>[] = [];

        if (args.filter.type !== undefined) {
          andConditions.push({ type: args.filter.type });
        }

        if (args.filter.universe !== undefined) {
          andConditions.push({ universe: args.filter.universe });
        }

        if (args.filter.manufacturer) {
          andConditions.push({
            manufacturer: {
              contains: args.filter.manufacturer,
              mode: "insensitive",
            },
          });
        }

        if (args.filter.model) {
          andConditions.push({
            model: {
              contains: args.filter.model,
              mode: "insensitive",
            },
          });
        }

        if (args.filter.tags && args.filter.tags.length > 0) {
          // Tags are stored as comma-separated string
          // Filter for fixtures that have ALL the specified tags
          const tagConditions = args.filter.tags.map((tag) => ({
            tags: {
              contains: tag,
            },
          }));
          andConditions.push(...tagConditions);
        }

        if (andConditions.length > 0) {
          where.AND = andConditions;
        }
      }

      // Execute queries in parallel
      const [fixtures, total] = await Promise.all([
        prisma.fixtureInstance.findMany({
          where,
          skip,
          take,
          include: {
            channels: {
              orderBy: { offset: "asc" },
            },
            project: true,
          },
          orderBy: [{ projectOrder: "asc" }, { createdAt: "asc" }],
        }),
        prisma.fixtureInstance.count({ where }),
      ]);

      const totalPages = Math.ceil(total / normalizedPerPage);

      return {
        fixtures,
        pagination: {
          total,
          page: normalizedPage,
          perPage: normalizedPerPage,
          totalPages,
          hasMore: normalizedPage < totalPages,
        },
      };
    },

    /**
     * Search scenes by name or description
     * Combines search query with optional filters
     */
    searchScenes: async (
      _: unknown,
      args: SearchScenesArgs,
      { prisma }: Context,
    ) => {
      const { projectId, query, page = 1, perPage = 50 } = args;

      // Validate and normalize pagination parameters
      const normalizedPage = Math.max(1, page);
      const normalizedPerPage = Math.min(100, Math.max(1, perPage));
      const skip = (normalizedPage - 1) * normalizedPerPage;
      const take = normalizedPerPage;

      // Build where clause with search conditions
      const where: Record<string, unknown> = {
        projectId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      };

      // Apply additional filters if provided
      if (args.filter) {
        const andConditions: Record<string, unknown>[] = [];

        if (args.filter.nameContains) {
          andConditions.push({
            name: {
              contains: args.filter.nameContains,
              mode: "insensitive",
            },
          });
        }

        if (args.filter.usesFixture) {
          // Filter scenes that use a specific fixture
          andConditions.push({
            fixtureValues: {
              some: {
                fixtureId: args.filter.usesFixture,
              },
            },
          });
        }

        if (andConditions.length > 0) {
          where.AND = andConditions;
        }
      }

      // Execute queries in parallel
      const [scenes, total] = await Promise.all([
        prisma.scene.findMany({
          where,
          skip,
          take,
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                fixtureValues: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
        prisma.scene.count({ where }),
      ]);

      const totalPages = Math.ceil(total / normalizedPerPage);

      // Map scenes to SceneSummary format
      const sceneSummaries = scenes.map((scene) => ({
        id: scene.id,
        name: scene.name,
        description: scene.description,
        fixtureCount: scene._count.fixtureValues,
        createdAt: scene.createdAt.toISOString(),
        updatedAt: scene.updatedAt.toISOString(),
      }));

      return {
        scenes: sceneSummaries,
        pagination: {
          total,
          page: normalizedPage,
          perPage: normalizedPerPage,
          totalPages,
          hasMore: normalizedPage < totalPages,
        },
      };
    },

    /**
     * Search cues by name or notes within a cue list
     */
    searchCues: async (
      _: unknown,
      args: SearchCuesArgs,
      { prisma }: Context,
    ) => {
      const { cueListId, query, page = 1, perPage = 50 } = args;

      // Validate and normalize pagination parameters
      const normalizedPage = Math.max(1, page);
      const normalizedPerPage = Math.min(100, Math.max(1, perPage));
      const skip = (normalizedPage - 1) * normalizedPerPage;
      const take = normalizedPerPage;

      // Build where clause with search conditions
      const where = {
        cueListId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { notes: { contains: query, mode: "insensitive" } },
        ],
      };

      // Execute queries in parallel
      const [cues, total] = await Promise.all([
        prisma.cue.findMany({
          where,
          skip,
          take,
          include: {
            scene: true,
            cueList: true,
          },
          orderBy: { cueNumber: "asc" },
        }),
        prisma.cue.count({ where }),
      ]);

      const totalPages = Math.ceil(total / normalizedPerPage);

      return {
        cues,
        pagination: {
          total,
          page: normalizedPage,
          perPage: normalizedPerPage,
          totalPages,
          hasMore: normalizedPage < totalPages,
        },
      };
    },
  },
};
