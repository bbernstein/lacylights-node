import { Context } from '../../context';
import { previewService } from '../../services/previewService';

export const previewResolvers = {
  Query: {
    previewSession: async (_: unknown, { sessionId }: { sessionId: string }, context: Context) => {
      const session = await previewService.getPreviewSession(sessionId);
      if (!session) {
        throw new Error('Preview session not found');
      }

      const project = await context.prisma.project.findUnique({
        where: { id: session.projectId },
      });

      return {
        id: session.id,
        project,
        user: null, // TODO: Implement user lookup when auth is added
        isActive: session.isActive,
        createdAt: session.createdAt.toISOString(),
        dmxOutput: await getDMXOutput(session.id),
      };
    },
  },

  Mutation: {
    startPreviewSession: async (_: unknown, { projectId }: { projectId: string }, context: Context) => {
      // Verify project exists
      const project = await context.prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      const session = await previewService.startPreviewSession(projectId);

      return {
        id: session.id,
        project,
        user: null, // TODO: Implement user lookup when auth is added
        isActive: session.isActive,
        createdAt: session.createdAt.toISOString(),
        dmxOutput: await getDMXOutput(session.id),
      };
    },

    commitPreviewSession: async (_: unknown, { sessionId }: { sessionId: string }, _context: Context) => {
      return await previewService.commitPreviewSession(sessionId);
    },

    cancelPreviewSession: async (_: unknown, { sessionId }: { sessionId: string }, _context: Context) => {
      return await previewService.cancelPreviewSession(sessionId);
    },

    updatePreviewChannel: async (
      _: unknown,
      { sessionId, fixtureId, channelIndex, value }: {
        sessionId: string;
        fixtureId: string;
        channelIndex: number;
        value: number;
      },
      _context: Context
    ) => {
      return await previewService.updateChannelValue(sessionId, fixtureId, channelIndex, value);
    },

    initializePreviewWithScene: async (
      _: unknown,
      { sessionId, sceneId }: { sessionId: string; sceneId: string },
      _context: Context
    ) => {
      return await previewService.initializeWithScene(sessionId, sceneId);
    },
  },

  Subscription: {
    previewSessionUpdated: {
      subscribe: (_: unknown, { projectId: _projectId }: { projectId: string }, context: Context) => {
        return context.pubsub.asyncIterator(['PREVIEW_SESSION_UPDATED']);
      },
    },

    dmxOutputChanged: {
      subscribe: (_: unknown, { universe: _universe }: { universe?: number }, context: Context) => {
        return context.pubsub.asyncIterator(['DMX_OUTPUT_CHANGED']);
      },
    },
  },

  types: {},
};

// Helper function to get DMX output for a session
async function getDMXOutput(sessionId: string) {
  const session = await previewService.getPreviewSession(sessionId);
  if (!session) {return [];}

  const universesUsed = new Set<number>();
  for (const channelKey of session.channelOverrides.keys()) {
    const [universe] = channelKey.split(':').map(Number);
    universesUsed.add(universe);
  }

  const output = [];
  for (const universe of universesUsed) {
    // This will be implemented in the preview service
    output.push({
      universe,
      channels: Array.from({ length: 512 }, (_, i) => {
        const channelKey = `${universe}:${i + 1}`;
        return session.channelOverrides.get(channelKey) || 0;
      }),
    });
  }

  return output;
}
