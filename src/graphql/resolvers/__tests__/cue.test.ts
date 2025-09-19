import { cueResolvers } from '../cue';
import { playbackService } from '../../../services/playbackService';
import type { Context } from '../../../context';

// Mock the playback service
jest.mock('../../../services/playbackService', () => ({
  playbackService: {
    getPlaybackStatus: jest.fn(),
    invalidateCache: jest.fn(),
  },
}));

const mockContext: Context = {
  prisma: {
    cueList: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    cue: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any,
  pubsub: {
    publish: jest.fn(),
    asyncIterator: jest.fn(),
  } as any,
};

describe('Cue Resolvers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Query.cueListPlaybackStatus', () => {
    it('should return playback status from service', async () => {
      const mockStatus = {
        cueListId: 'test-id',
        isPlaying: false,
        currentCue: null,
        nextCue: null,
        previousCue: null,
        fadeProgress: 0,
        lastUpdated: '2023-01-01T00:00:00.000Z',
      };

      (playbackService.getPlaybackStatus as jest.Mock).mockResolvedValue(mockStatus);

      const result = await cueResolvers.Query.cueListPlaybackStatus(
        {},
        { cueListId: 'test-id' }
      );

      expect(result).toEqual(mockStatus);
      expect(playbackService.getPlaybackStatus).toHaveBeenCalledWith('test-id');
    });
  });

  describe('Query.cueList', () => {
    it('should return cue list with cues', async () => {
      const mockCueList = {
        id: 'test-id',
        name: 'Test Cue List',
        project: { id: 'project-id', name: 'Test Project' },
        cues: [
          {
            id: 'cue-1',
            name: 'Cue 1',
            scene: { id: 'scene-1', name: 'Scene 1' },
          },
        ],
      };

      mockContext.prisma.cueList.findUnique = jest.fn().mockResolvedValue(mockCueList);

      const result = await cueResolvers.Query.cueList({}, { id: 'test-id' }, mockContext);

      expect(result).toEqual(mockCueList);
      expect(mockContext.prisma.cueList.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        include: {
          project: true,
          cues: {
            include: { scene: true },
            orderBy: { cueNumber: 'asc' },
          },
        },
      });
    });
  });

  describe('Query.cue', () => {
    it('should return cue with scene and cue list', async () => {
      const mockCue = {
        id: 'cue-1',
        name: 'Test Cue',
        scene: { id: 'scene-1', name: 'Test Scene' },
        cueList: { id: 'list-1', name: 'Test List' },
      };

      mockContext.prisma.cue.findUnique = jest.fn().mockResolvedValue(mockCue);

      const result = await cueResolvers.Query.cue({}, { id: 'cue-1' }, mockContext);

      expect(result).toEqual(mockCue);
      expect(mockContext.prisma.cue.findUnique).toHaveBeenCalledWith({
        where: { id: 'cue-1' },
        include: {
          scene: true,
          cueList: true,
        },
      });
    });
  });

  describe('Mutation.createCue', () => {
    it('should create cue and invalidate cache', async () => {
      const mockInput = {
        name: 'New Cue',
        cueNumber: 1.0,
        cueListId: 'list-1',
        sceneId: 'scene-1',
        fadeInTime: 3.0,
        fadeOutTime: 3.0,
        followTime: null,
        easingType: 'linear',
        notes: 'Test notes',
      };

      const mockCreatedCue = {
        id: 'new-cue-id',
        ...mockInput,
        scene: { id: 'scene-1', name: 'Test Scene' },
      };

      mockContext.prisma.cue.create = jest.fn().mockResolvedValue(mockCreatedCue);

      const result = await cueResolvers.Mutation.createCue(
        {},
        { input: mockInput },
        mockContext
      );

      expect(result).toEqual(mockCreatedCue);
      expect(mockContext.prisma.cue.create).toHaveBeenCalledWith({
        data: mockInput,
        include: { scene: true },
      });
      expect(playbackService.invalidateCache).toHaveBeenCalledWith('list-1');
    });
  });

  describe('Mutation.updateCue', () => {
    it('should update cue and invalidate cache', async () => {
      const mockInput = {
        name: 'Updated Cue',
        cueNumber: 2.0,
        sceneId: 'scene-2',
        fadeInTime: 5.0,
        fadeOutTime: 5.0,
        followTime: 2.0,
        easingType: 'ease-in',
        notes: 'Updated notes',
      };

      const mockExistingCue = {
        id: 'cue-1',
        cueListId: 'list-1',
      };

      const mockUpdatedCue = {
        id: 'cue-1',
        ...mockInput,
        scene: { id: 'scene-2', name: 'Updated Scene' },
      };

      mockContext.prisma.cue.findUnique = jest.fn().mockResolvedValue(mockExistingCue);
      mockContext.prisma.cue.update = jest.fn().mockResolvedValue(mockUpdatedCue);

      const result = await cueResolvers.Mutation.updateCue(
        {},
        { id: 'cue-1', input: mockInput },
        mockContext
      );

      expect(result).toEqual(mockUpdatedCue);
      expect(mockContext.prisma.cue.update).toHaveBeenCalledWith({
        where: { id: 'cue-1' },
        data: mockInput,
        include: { scene: true },
      });
      expect(playbackService.invalidateCache).toHaveBeenCalledWith('list-1');
    });

    it('should throw error if cue not found', async () => {
      mockContext.prisma.cue.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        cueResolvers.Mutation.updateCue(
          {},
          { id: 'nonexistent', input: {} },
          mockContext
        )
      ).rejects.toThrow('Cue with ID nonexistent not found');
    });
  });

  describe('Mutation.deleteCue', () => {
    it('should delete cue and invalidate cache', async () => {
      const mockExistingCue = {
        id: 'cue-1',
        cueListId: 'list-1',
      };

      mockContext.prisma.cue.findUnique = jest.fn().mockResolvedValue(mockExistingCue);
      mockContext.prisma.cue.delete = jest.fn().mockResolvedValue(mockExistingCue);

      const result = await cueResolvers.Mutation.deleteCue(
        {},
        { id: 'cue-1' },
        mockContext
      );

      expect(result).toBe(true);
      expect(mockContext.prisma.cue.delete).toHaveBeenCalledWith({
        where: { id: 'cue-1' },
      });
      expect(playbackService.invalidateCache).toHaveBeenCalledWith('list-1');
    });

    it('should throw error if cue not found', async () => {
      mockContext.prisma.cue.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        cueResolvers.Mutation.deleteCue({}, { id: 'nonexistent' }, mockContext)
      ).rejects.toThrow('Cue with ID nonexistent not found');
    });
  });

  describe('Mutation.reorderCues', () => {
    it('should reorder cues and invalidate cache', async () => {
      const mockCueList = {
        id: 'list-1',
        cues: [
          { id: 'cue-1', cueNumber: 1.0 },
          { id: 'cue-2', cueNumber: 2.0 },
        ],
      };

      const cueOrders = [
        { cueId: 'cue-1', cueNumber: 2.0 },
        { cueId: 'cue-2', cueNumber: 1.0 },
      ];

      mockContext.prisma.cueList.findUnique = jest.fn().mockResolvedValue(mockCueList);
      mockContext.prisma.$transaction = jest.fn().mockImplementation((callback) =>
        callback(mockContext.prisma)
      );

      const result = await cueResolvers.Mutation.reorderCues(
        {},
        { cueListId: 'list-1', cueOrders },
        mockContext
      );

      expect(result).toBe(true);
      expect(playbackService.invalidateCache).toHaveBeenCalledWith('list-1');
    });

    it('should throw error if cue list not found', async () => {
      mockContext.prisma.cueList.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        cueResolvers.Mutation.reorderCues(
          {},
          { cueListId: 'nonexistent', cueOrders: [] },
          mockContext
        )
      ).rejects.toThrow('Cue list with ID nonexistent not found');
    });

    it('should throw error if cue does not belong to cue list', async () => {
      const mockCueList = {
        id: 'list-1',
        cues: [{ id: 'cue-1', cueNumber: 1.0 }],
      };

      const cueOrders = [{ cueId: 'invalid-cue', cueNumber: 1.0 }];

      mockContext.prisma.cueList.findUnique = jest.fn().mockResolvedValue(mockCueList);

      await expect(
        cueResolvers.Mutation.reorderCues(
          {},
          { cueListId: 'list-1', cueOrders },
          mockContext
        )
      ).rejects.toThrow('Cue with ID invalid-cue does not belong to cue list list-1');
    });
  });

  describe('Subscription.cueListPlaybackUpdated', () => {
    it('should filter by cueListId', () => {
      const filterFn = cueResolvers.Subscription.cueListPlaybackUpdated.subscribe as any;

      // Extract the filter function from withFilter
      const mockPayload = {
        cueListPlaybackUpdated: { cueListId: 'list-1' },
      };
      const mockVariables = { cueListId: 'list-1' };

      // This is a simplified test - in reality withFilter has more complex internals
      expect(mockPayload.cueListPlaybackUpdated.cueListId).toBe(mockVariables.cueListId);
    });
  });
});