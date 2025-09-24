import type { PubSub } from 'graphql-subscriptions';
import type { PrismaClient } from '@prisma/client';

// Mock dependencies
const mockPrisma = {
  cueList: {
    findUnique: jest.fn(),
  },
} as unknown as PrismaClient;

const mockPubSub = {
  publish: jest.fn(),
  asyncIterator: jest.fn(),
} as unknown as PubSub;

// Mock the context module
jest.mock('../../context', () => ({
  prisma: mockPrisma,
  pubsub: mockPubSub,
}));

import { getPlaybackStateService } from '../playbackStateService';

describe('PlaybackStateService', () => {
  let playbackStateService: ReturnType<typeof getPlaybackStateService>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Get the service instance for testing
    playbackStateService = getPlaybackStateService();
  });

  afterEach(() => {
    jest.useRealTimers();
    playbackStateService.cleanup();
  });

  const mockCue = {
    id: 'cue-1',
    name: 'Test Cue',
    cueNumber: 1.0,
    fadeInTime: 3.0,
    fadeOutTime: 3.0,
    followTime: null,
  };

  const mockCueList = {
    id: 'test-cue-list-id',
    name: 'Test Cue List',
    cues: [
      {
        ...mockCue,
        scene: { id: 'scene-1', name: 'Scene 1' }
      },
      {
        id: 'cue-2',
        name: 'Test Cue 2',
        cueNumber: 2.0,
        fadeInTime: 2.0,
        fadeOutTime: 2.0,
        followTime: null,
        scene: { id: 'scene-2', name: 'Scene 2' }
      }
    ],
  };

  describe('getPlaybackState', () => {
    it('should return null for non-existent cue list', () => {
      const state = playbackStateService.getPlaybackState('non-existent');
      expect(state).toBeNull();
    });

    it('should return playback state after starting cue', async () => {
      await playbackStateService.startCue('test-cue-list', 0, mockCue);

      const state = playbackStateService.getPlaybackState('test-cue-list');

      expect(state).not.toBeNull();
      expect(state!.cueListId).toBe('test-cue-list');
      expect(state!.currentCueIndex).toBe(0);
      expect(state!.isPlaying).toBe(true);
      expect(state!.currentCue).toEqual({
        id: mockCue.id,
        name: mockCue.name,
        cueNumber: mockCue.cueNumber,
        fadeInTime: mockCue.fadeInTime,
        fadeOutTime: mockCue.fadeOutTime,
        followTime: mockCue.followTime,
      });
    });
  });

  describe('startCue', () => {
    it('should start cue and emit subscription update', async () => {
      await playbackStateService.startCue('test-cue-list', 0, mockCue);

      // Verify subscription was published with correct channel name
      expect(mockPubSub.publish).toHaveBeenCalledWith('CUE_LIST_PLAYBACK_UPDATED', {
        cueListPlaybackUpdated: expect.objectContaining({
          cueListId: 'test-cue-list',
          currentCueIndex: 0,
          isPlaying: true,
          fadeProgress: 0,
        }),
      });

      // Verify the channel name is NOT the old format with cueListId suffix
      expect(mockPubSub.publish).not.toHaveBeenCalledWith(
        expect.stringContaining('CUE_LIST_PLAYBACK_UPDATED_test-cue-list'),
        expect.anything()
      );
    });

    it('should clear existing state before starting new cue', async () => {
      // Start first cue
      await playbackStateService.startCue('test-cue-list', 0, mockCue);

      // Start second cue - should clear previous state
      const secondCue = { ...mockCue, id: 'cue-2', name: 'Cue 2' };
      await playbackStateService.startCue('test-cue-list', 1, secondCue);

      const state = playbackStateService.getPlaybackState('test-cue-list');
      expect(state!.currentCueIndex).toBe(1);
      expect(state!.currentCue!.id).toBe('cue-2');
    });

    it('should start fade progress tracking', async () => {
      await playbackStateService.startCue('test-cue-list', 0, mockCue);

      // Fast-forward time to simulate fade progress
      jest.advanceTimersByTime(1500); // 1.5 seconds of 3 second fade

      const state = playbackStateService.getPlaybackState('test-cue-list');
      expect(state!.fadeProgress).toBeCloseTo(50, 0); // Should be around 50%
    });

    it('should schedule follow time when specified', async () => {
      const cueWithFollow = { ...mockCue, followTime: 2.0 };

      // Mock the cue list with proper structure for follow time
      const mockCueListForFollow = {
        id: 'test-cue-list',
        cues: [
          {
            id: 'cue-1',
            name: 'Test Cue',
            cueNumber: 1.0,
            fadeInTime: 3.0,
            fadeOutTime: 3.0,
            followTime: 2.0,
            scene: { id: 'scene-1' }
          },
          {
            id: 'cue-2',
            name: 'Test Cue 2',
            cueNumber: 2.0,
            fadeInTime: 2.0,
            fadeOutTime: 2.0,
            followTime: null,
            scene: { id: 'scene-2' }
          }
        ]
      };

      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(mockCueListForFollow);

      await playbackStateService.startCue('test-cue-list', 0, cueWithFollow);

      // Verify initial state
      let state = playbackStateService.getPlaybackState('test-cue-list');
      expect(state!.currentCueIndex).toBe(0);

      // Fast-forward past fade + follow time (3s fade + 2s follow = 5s)
      // Use runAllTimers to handle async operations in the follow timeout
      await jest.runAllTimersAsync();

      // Should have automatically moved to next cue
      state = playbackStateService.getPlaybackState('test-cue-list');
      expect(state!.currentCueIndex).toBe(1);
    });

    it('should stop playing after fade completes when no follow time', async () => {
      await playbackStateService.startCue('test-cue-list', 0, mockCue);

      // Initially playing
      let state = playbackStateService.getPlaybackState('test-cue-list');
      expect(state!.isPlaying).toBe(true);

      // Fast-forward past fade time
      jest.advanceTimersByTime(3100);

      // Should have stopped playing
      state = playbackStateService.getPlaybackState('test-cue-list');
      expect(state!.isPlaying).toBe(false);
    });
  });

  describe('stopCueList', () => {
    it('should stop playback and clear intervals', async () => {
      await playbackStateService.startCue('test-cue-list', 0, mockCue);

      // Verify it's playing
      let state = playbackStateService.getPlaybackState('test-cue-list');
      expect(state!.isPlaying).toBe(true);

      playbackStateService.stopCueList('test-cue-list');

      // Verify it's stopped
      state = playbackStateService.getPlaybackState('test-cue-list');
      expect(state!.isPlaying).toBe(false);
      expect(state!.fadeProgress).toBe(0);

      // Verify subscription update was emitted
      expect(mockPubSub.publish).toHaveBeenCalledWith('CUE_LIST_PLAYBACK_UPDATED', {
        cueListPlaybackUpdated: expect.objectContaining({
          cueListId: 'test-cue-list',
          isPlaying: false,
          fadeProgress: 0,
        }),
      });
    });
  });

  describe('stopAllCueLists', () => {
    it('should stop all active cue lists', async () => {
      // Start multiple cue lists
      await playbackStateService.startCue('cue-list-1', 0, mockCue);
      await playbackStateService.startCue('cue-list-2', 0, mockCue);

      // Verify both are playing
      expect(playbackStateService.getPlaybackState('cue-list-1')!.isPlaying).toBe(true);
      expect(playbackStateService.getPlaybackState('cue-list-2')!.isPlaying).toBe(true);

      playbackStateService.stopAllCueLists();

      // Verify both are stopped
      expect(playbackStateService.getPlaybackState('cue-list-1')!.isPlaying).toBe(false);
      expect(playbackStateService.getPlaybackState('cue-list-2')!.isPlaying).toBe(false);
    });
  });

  describe('jumpToCue', () => {
    beforeEach(() => {
      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(mockCueList);
    });

    it('should jump to specified cue index', async () => {
      await playbackStateService.jumpToCue('test-cue-list', 1);

      const state = playbackStateService.getPlaybackState('test-cue-list');
      expect(state!.currentCueIndex).toBe(1);
      expect(state!.currentCue!.id).toBe('cue-2');
    });

    it('should throw error for invalid cue index', async () => {
      await expect(playbackStateService.jumpToCue('test-cue-list', 5)).rejects.toThrow('Invalid cue index');
      await expect(playbackStateService.jumpToCue('test-cue-list', -1)).rejects.toThrow('Invalid cue index');
    });

    it('should throw error for non-existent cue list', async () => {
      mockPrisma.cueList.findUnique = jest.fn().mockResolvedValue(null);

      await expect(playbackStateService.jumpToCue('non-existent', 0)).rejects.toThrow();
    });
  });

  describe('getFormattedStatus', () => {
    it('should return default status for non-existent cue list', () => {
      const status = playbackStateService.getFormattedStatus('non-existent');

      expect(status).toEqual({
        cueListId: 'non-existent',
        currentCueIndex: null,
        isPlaying: false,
        currentCue: undefined,
        fadeProgress: 0,
        lastUpdated: expect.any(String),
      });
    });

    it('should return formatted status for active cue list', async () => {
      await playbackStateService.startCue('test-cue-list', 0, mockCue);

      const status = playbackStateService.getFormattedStatus('test-cue-list');

      expect(status).toEqual({
        cueListId: 'test-cue-list',
        currentCueIndex: 0,
        isPlaying: true,
        currentCue: expect.objectContaining({
          id: mockCue.id,
          name: mockCue.name,
        }),
        fadeProgress: 0,
        lastUpdated: expect.any(String),
      });
    });
  });

  describe('subscription channel consistency', () => {
    it('should always publish to CUE_LIST_PLAYBACK_UPDATED channel', async () => {
      const cueListIds = ['test-1', 'test-2', 'different-cue-list-id'];

      // Test multiple cue lists to ensure consistent channel name
      for (const cueListId of cueListIds) {
        await playbackStateService.startCue(cueListId, 0, mockCue);

        // Verify the publish call uses the consistent channel name
        expect(mockPubSub.publish).toHaveBeenCalledWith('CUE_LIST_PLAYBACK_UPDATED', {
          cueListPlaybackUpdated: expect.objectContaining({
            cueListId,
          }),
        });

        // Stop the cue list
        playbackStateService.stopCueList(cueListId);

        // Verify stop also uses consistent channel
        expect(mockPubSub.publish).toHaveBeenCalledWith('CUE_LIST_PLAYBACK_UPDATED', {
          cueListPlaybackUpdated: expect.objectContaining({
            cueListId,
            isPlaying: false,
          }),
        });
      }

      // Ensure we never use the old inconsistent channel format
      const publishCalls = (mockPubSub.publish as jest.Mock).mock.calls;
      publishCalls.forEach(([channel]) => {
        expect(channel).toBe('CUE_LIST_PLAYBACK_UPDATED');
        expect(channel).not.toMatch(/CUE_LIST_PLAYBACK_UPDATED_.+/);
      });
    });

    it('should emit updates with proper cueListId for subscription filtering', async () => {
      await playbackStateService.startCue('specific-cue-list', 0, mockCue);

      const publishCall = (mockPubSub.publish as jest.Mock).mock.calls.find(
        ([channel]) => channel === 'CUE_LIST_PLAYBACK_UPDATED'
      );

      expect(publishCall).toBeDefined();
      expect(publishCall[1]).toEqual({
        cueListPlaybackUpdated: expect.objectContaining({
          cueListId: 'specific-cue-list',
        }),
      });
    });
  });

  describe('fade progress emissions', () => {
    it('should emit fade progress updates during fade', async () => {
      await playbackStateService.startCue('test-cue-list', 0, mockCue);

      const initialPublishCount = (mockPubSub.publish as jest.Mock).mock.calls.length;

      // Advance time to trigger fade progress updates
      jest.advanceTimersByTime(300); // 0.3 seconds

      // Should have emitted additional updates during fade
      expect(mockPubSub.publish).toHaveBeenCalledTimes(initialPublishCount + 3); // 3 more calls at 100ms intervals

      // Verify the updates contain fade progress
      const recentCalls = (mockPubSub.publish as jest.Mock).mock.calls.slice(initialPublishCount);
      recentCalls.forEach(([channel, payload]) => {
        expect(channel).toBe('CUE_LIST_PLAYBACK_UPDATED');
        expect(payload.cueListPlaybackUpdated.fadeProgress).toBeGreaterThan(0);
      });
    });
  });

  describe('cleanup', () => {
    it('should clear all states and intervals', async () => {
      await playbackStateService.startCue('test-cue-list-1', 0, mockCue);
      await playbackStateService.startCue('test-cue-list-2', 0, mockCue);

      // Verify states exist
      expect(playbackStateService.getPlaybackState('test-cue-list-1')).not.toBeNull();
      expect(playbackStateService.getPlaybackState('test-cue-list-2')).not.toBeNull();

      playbackStateService.cleanup();

      // Verify states are cleared
      expect(playbackStateService.getPlaybackState('test-cue-list-1')).toBeNull();
      expect(playbackStateService.getPlaybackState('test-cue-list-2')).toBeNull();
    });
  });

  describe('singleton service', () => {
    it('should return same instance from getPlaybackStateService', () => {
      const service1 = getPlaybackStateService();
      const service2 = getPlaybackStateService();

      expect(service1).toBe(service2);
    });
  });
});