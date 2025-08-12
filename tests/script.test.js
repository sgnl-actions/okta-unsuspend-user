import { jest } from '@jest/globals';
import script from '../src/script.mjs';

// Mock fetch globally
global.fetch = jest.fn();

describe('Okta Unsuspend User Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('invoke handler', () => {
    test('should successfully unsuspend user with valid inputs', async () => {
      const params = {
        userId: 'user123',
        oktaDomain: 'example.okta.com'
      };

      const context = {
        secrets: {
          OKTA_API_TOKEN: 'SSWS test-token-123'
        }
      };

      // Mock successful API response (200 OK with user data)
      const mockUserData = {
        id: 'user123',
        status: 'ACTIVE',
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com'
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      const result = await script.invoke(params, context);

      expect(result).toEqual({
        userId: 'user123',
        unsuspended: true,
        oktaDomain: 'example.okta.com',
        unsuspendedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        status: 'ACTIVE'
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://example.okta.com/api/v1/users/user123/lifecycle/unsuspend',
        {
          method: 'POST',
          headers: {
            'Authorization': 'SSWS test-token-123',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );
    });

    test('should add SSWS prefix to token if missing', async () => {
      const params = {
        userId: 'user456',
        oktaDomain: 'test.okta.com'
      };

      const context = {
        secrets: {
          OKTA_API_TOKEN: 'token-without-prefix'
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ACTIVE' })
      });

      await script.invoke(params, context);

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'SSWS token-without-prefix'
          })
        })
      );
    });

    test('should encode userId to prevent injection', async () => {
      const params = {
        userId: 'user@test.com/../../admin',
        oktaDomain: 'example.okta.com'
      };

      const context = {
        secrets: {
          OKTA_API_TOKEN: 'SSWS test-token'
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ACTIVE' })
      });

      await script.invoke(params, context);

      // Check that the URL is properly encoded
      expect(fetch).toHaveBeenCalledWith(
        'https://example.okta.com/api/v1/users/user%40test.com%2F..%2F..%2Fadmin/lifecycle/unsuspend',
        expect.any(Object)
      );
    });

    test('should throw error when API token is missing', async () => {
      const params = {
        userId: 'user789',
        oktaDomain: 'example.okta.com'
      };

      const context = {
        secrets: {}
      };

      await expect(script.invoke(params, context)).rejects.toThrow(
        'Missing required secret: OKTA_API_TOKEN'
      );

      expect(fetch).not.toHaveBeenCalled();
    });

    test('should throw error when userId is missing', async () => {
      const params = {
        oktaDomain: 'example.okta.com'
      };

      const context = {
        secrets: {
          OKTA_API_TOKEN: 'SSWS test-token'
        }
      };

      await expect(script.invoke(params, context)).rejects.toThrow(
        'Invalid or missing userId parameter'
      );

      expect(fetch).not.toHaveBeenCalled();
    });

    test('should throw error when oktaDomain is missing', async () => {
      const params = {
        userId: 'user123'
      };

      const context = {
        secrets: {
          OKTA_API_TOKEN: 'SSWS test-token'
        }
      };

      await expect(script.invoke(params, context)).rejects.toThrow(
        'Invalid or missing oktaDomain parameter'
      );

      expect(fetch).not.toHaveBeenCalled();
    });

    test('should handle API error responses', async () => {
      const params = {
        userId: 'invalid-user',
        oktaDomain: 'example.okta.com'
      };

      const context = {
        secrets: {
          OKTA_API_TOKEN: 'SSWS test-token'
        }
      };

      // Mock 404 Not Found response
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          errorCode: 'E0000007',
          errorSummary: 'Not found: Resource not found: invalid-user (User)'
        })
      });

      const error = await script.invoke(params, context).catch(e => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Not found: Resource not found');
      expect(error.statusCode).toBe(404);
    });

    test('should handle response without JSON body', async () => {
      const params = {
        userId: 'user123',
        oktaDomain: 'example.okta.com'
      };

      const context = {
        secrets: {
          OKTA_API_TOKEN: 'SSWS test-token'
        }
      };

      // Mock success response without JSON body
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      });

      const result = await script.invoke(params, context);

      expect(result).toEqual({
        userId: 'user123',
        unsuspended: true,
        oktaDomain: 'example.okta.com',
        unsuspendedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        status: 'ACTIVE'
      });
    });

    test('should handle user not suspended error (400)', async () => {
      const params = {
        userId: 'active-user',
        oktaDomain: 'example.okta.com'
      };

      const context = {
        secrets: {
          OKTA_API_TOKEN: 'SSWS test-token'
        }
      };

      // Mock 400 Bad Request - user not suspended
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          errorCode: 'E0000001',
          errorSummary: 'Api validation failed: User is not suspended'
        })
      });

      const error = await script.invoke(params, context).catch(e => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('User is not suspended');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('error handler', () => {
    test('should re-throw error for framework to handle', async () => {
      const testError = new Error('Failed to unsuspend user: HTTP 429');
      testError.statusCode = 429;

      const params = {
        userId: 'user123',
        oktaDomain: 'example.okta.com',
        error: testError
      };

      const context = {
        secrets: {
          OKTA_API_TOKEN: 'SSWS test-token'
        }
      };

      await expect(script.error(params, context)).rejects.toThrow(testError);
      expect(fetch).not.toHaveBeenCalled();
    });

    test('should log error details', async () => {
      const consoleSpy = jest.spyOn(console, 'error');
      const testError = new Error('Service unavailable');
      testError.statusCode = 503;

      const params = {
        userId: 'user456',
        oktaDomain: 'test.okta.com',
        error: testError
      };

      const context = {};

      try {
        await script.error(params, context);
      } catch {
        // Expected to throw
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        'User unsuspension failed for user user456: Service unavailable'
      );
    });
  });

  describe('halt handler', () => {
    test('should handle graceful shutdown', async () => {
      const params = {
        userId: 'user123',
        reason: 'timeout'
      };

      const context = {};

      const result = await script.halt(params, context);

      expect(result).toEqual({
        userId: 'user123',
        reason: 'timeout',
        haltedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        cleanupCompleted: true
      });
    });

    test('should handle halt with missing userId', async () => {
      const params = {
        reason: 'cancelled'
      };

      const context = {};

      const result = await script.halt(params, context);

      expect(result).toEqual({
        userId: 'unknown',
        reason: 'cancelled',
        haltedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        cleanupCompleted: true
      });
    });
  });
});