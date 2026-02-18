import { jest } from '@jest/globals';
import script from '../src/script.mjs';
import { SGNL_USER_AGENT } from '@sgnl-actions/utils';

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
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token-123'
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
        },
        statusChanged: '2024-01-15T10:30:00.000Z'
      };

      // Mock unsuspend endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      // Mock getUser endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      const result = await script.invoke(params, context);

      expect(result).toEqual({
        userId: 'user123',
        unsuspended: true,
        address: 'https://example.okta.com',
        unsuspendedAt: '2024-01-15T10:30:00.000Z',
        status: 'ACTIVE'
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://example.okta.com/api/v1/users/user123/lifecycle/unsuspend',
        {
          method: 'POST',
          headers: {
            'Authorization': 'SSWS test-token-123',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': SGNL_USER_AGENT
          }
        }
      );
    });

    test('should add SSWS prefix to token if missing', async () => {
      const params = {
        userId: 'user456',
        address: 'https://test.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'token-without-prefix'
        }
      };

      const mockUserData = {
        status: 'ACTIVE',
        statusChanged: '2024-01-15T10:30:00.000Z'
      };

      // Mock unsuspend endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      // Mock getUser endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      await script.invoke(params, context);

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'SSWS token-without-prefix',
            'User-Agent': SGNL_USER_AGENT
          })
        })
      );
    });

    test('should encode userId to prevent injection', async () => {
      const params = {
        userId: 'user@test.com/../../admin',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      const mockUserData = {
        status: 'ACTIVE',
        statusChanged: '2024-01-15T10:30:00.000Z'
      };

      // Mock unsuspend endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      // Mock getUser endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
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
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {}
      };

      await expect(script.invoke(params, context)).rejects.toThrow(
        'No authentication configured'
      );

      expect(fetch).not.toHaveBeenCalled();
    });

    test('should throw error when address is missing', async () => {
      const params = {
        userId: 'user123'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      await expect(script.invoke(params, context)).rejects.toThrow(
        'No URL specified. Provide address parameter or ADDRESS environment variable'
      );

      expect(fetch).not.toHaveBeenCalled();
    });

    test('should handle API error responses', async () => {
      const params = {
        userId: 'invalid-user',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
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
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      const mockUserData = {
        status: 'ACTIVE',
        statusChanged: '2024-01-15T10:30:00.000Z'
      };

      // Mock unsuspend endpoint - success response without JSON body
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      });

      // Mock getUser endpoint - returns valid user data
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      const result = await script.invoke(params, context);

      expect(result).toEqual({
        userId: 'user123',
        unsuspended: true,
        address: 'https://example.okta.com',
        unsuspendedAt: '2024-01-15T10:30:00.000Z',
        status: 'ACTIVE'
      });
    });

    test('should handle user not suspended error (400)', async () => {
      const params = {
        userId: 'active-user',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      const mockUserData = {
        id: 'active-user',
        status: 'ACTIVE',
        profile: {
          firstName: 'John',
          lastName: 'Doe'
        },
        statusChanged: '2024-01-15T10:30:00.000Z'
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

      // Mock getUser endpoint - returns ACTIVE user
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      const result = await script.invoke(params, context);

      // Should succeed idempotently - user is already ACTIVE
      expect(result).toEqual({
        userId: 'active-user',
        unsuspended: true,
        address: 'https://example.okta.com',
        unsuspendedAt: '2024-01-15T10:30:00.000Z',
        status: 'ACTIVE'
      });
    });

    test('should handle getUser API failure', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      // Mock successful unsuspend
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ACTIVE' })
      });

      // Mock getUser failure (500 Internal Server Error)
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          errorCode: 'E0000009',
          errorSummary: 'Internal Server Error'
        })
      });

      const error = await script.invoke(params, context).catch(e => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Cannot fetch information about User: HTTP 500');
      expect(error.statusCode).toBe(500);
    });

    test('should handle getUser returning invalid JSON', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      // Mock successful unsuspend
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ACTIVE' })
      });

      // Mock getUser with invalid JSON
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected end of JSON input');
        }
      });

      const error = await script.invoke(params, context).catch(e => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Cannot parse user data');
      expect(error.statusCode).toBe(500);
    });

    test('should handle user status not ACTIVE after unsuspend', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      // Mock successful unsuspend
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'SUSPENDED' })
      });

      // Mock getUser returning still SUSPENDED status
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'user123',
          status: 'SUSPENDED',
          profile: {
            firstName: 'John',
            lastName: 'Doe'
          }
        })
      });

      const error = await script.invoke(params, context).catch(e => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('User user123 could not be unsuspended');
      expect(error.message).toContain('SUSPENDED');
      expect(error.statusCode).toBe(400);
    });

    test('should use lastUpdated when statusChanged is missing', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      const mockUserData = {
        id: 'user123',
        status: 'ACTIVE',
        profile: {
          firstName: 'John',
          lastName: 'Doe'
        },
        lastUpdated: '2024-01-15T12:45:00.000Z'
      };

      // Mock unsuspend endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      // Mock getUser endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      const result = await script.invoke(params, context);

      expect(result).toEqual({
        userId: 'user123',
        unsuspended: true,
        address: 'https://example.okta.com',
        unsuspendedAt: '2024-01-15T12:45:00.000Z',
        status: 'ACTIVE'
      });
    });

    test('should not double-prefix token that already has SSWS', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS already-prefixed-token'
        }
      };

      const mockUserData = {
        status: 'ACTIVE',
        statusChanged: '2024-01-15T10:30:00.000Z'
      };

      // Mock unsuspend endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      // Mock getUser endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      await script.invoke(params, context);

      // Verify SSWS prefix is not doubled
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'SSWS already-prefixed-token'
          })
        })
      );
    });

    test('should handle 400 when user remains SUSPENDED after unsuspend attempt', async () => {
      const params = {
        userId: 'suspended-user',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      // Mock 400 response from unsuspend
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          errorCode: 'E0000001',
          errorSummary: 'Api validation failed'
        })
      });

      // Mock getUser returning SUSPENDED status
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'suspended-user',
          status: 'SUSPENDED',
          profile: {
            firstName: 'Still',
            lastName: 'Suspended'
          }
        })
      });

      const error = await script.invoke(params, context).catch(e => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('User suspended-user could not be unsuspended');
      expect(error.message).toContain('SUSPENDED');
      expect(error.statusCode).toBe(400);
    });

    test('should handle user with non-standard status after unsuspend', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      const mockUserData = {
        id: 'user123',
        status: 'RECOVERY',
        profile: {
          firstName: 'John',
          lastName: 'Doe'
        },
        statusChanged: '2024-01-15T10:30:00.000Z'
      };

      // Mock unsuspend endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      // Mock getUser endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      const result = await script.invoke(params, context);

      // Should succeed with the actual status returned
      expect(result).toEqual({
        userId: 'user123',
        unsuspended: true,
        address: 'https://example.okta.com',
        unsuspendedAt: '2024-01-15T10:30:00.000Z',
        status: 'RECOVERY'
      });
    });

    test('should handle missing both statusChanged and lastUpdated', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      const mockUserData = {
        id: 'user123',
        status: 'ACTIVE',
        profile: {
          firstName: 'John',
          lastName: 'Doe'
        }
        // No statusChanged or lastUpdated
      };

      // Mock unsuspend endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      // Mock getUser endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      const result = await script.invoke(params, context);

      expect(result).toEqual({
        userId: 'user123',
        unsuspended: true,
        address: 'https://example.okta.com',
        unsuspendedAt: undefined,
        status: 'ACTIVE'
      });
    });

    test('should handle 401 unauthorized error', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS invalid-token'
        }
      };

      // Mock 401 Unauthorized response
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          errorCode: 'E0000011',
          errorSummary: 'Invalid token provided'
        })
      });

      const error = await script.invoke(params, context).catch(e => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Invalid token provided');
      expect(error.statusCode).toBe(401);
    });

    test('should handle 403 forbidden error', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      // Mock 403 Forbidden response
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          errorCode: 'E0000006',
          errorSummary: 'You do not have permission to perform the requested action'
        })
      });

      const error = await script.invoke(params, context).catch(e => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('You do not have permission');
      expect(error.statusCode).toBe(403);
    });

    test('should handle 429 rate limit error', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      // Mock 429 Too Many Requests response
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          errorCode: 'E0000047',
          errorSummary: 'API call exceeded rate limit'
        })
      });

      const error = await script.invoke(params, context).catch(e => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('API call exceeded rate limit');
      expect(error.statusCode).toBe(429);
    });

    test('should handle network error without JSON body', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      // Mock 503 Service Unavailable without JSON
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => {
          throw new Error('Not JSON');
        }
      });

      const error = await script.invoke(params, context).catch(e => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Failed to unsuspend user: HTTP 503');
      expect(error.statusCode).toBe(503);
    });

    test('should handle error response without errorSummary field', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
        }
      };

      // Mock error response with JSON but no errorSummary
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          errorCode: 'E0000009',
          errorId: 'oaeXYZ123'
          // No errorSummary field
        })
      });

      const error = await script.invoke(params, context).catch(e => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Failed to unsuspend user: HTTP 500');
      expect(error.statusCode).toBe(500);
    });

    test('should work with non-Bearer auth modes (OAuth2)', async () => {
      const params = {
        userId: 'user123',
        address: 'https://example.okta.com'
      };

      // Simulate OAuth2 auth mode (no BEARER_AUTH_TOKEN)
      const context = {
        secrets: {
          OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN: 'oauth-token-xyz'
        },
        environment: {}
      };

      const mockUserData = {
        id: 'user123',
        status: 'ACTIVE',
        statusChanged: '2024-01-15T10:30:00.000Z'
      };

      // Mock unsuspend endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      // Mock getUser endpoint
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData
      });

      const result = await script.invoke(params, context);

      expect(result).toEqual({
        userId: 'user123',
        unsuspended: true,
        address: 'https://example.okta.com',
        unsuspendedAt: '2024-01-15T10:30:00.000Z',
        status: 'ACTIVE'
      });

      // Should NOT attempt SSWS conversion for OAuth tokens
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.not.stringContaining('SSWS')
          })
        })
      );
    });
  });

  describe('error handler', () => {
    test('should re-throw error for framework to handle', async () => {
      const testError = new Error('Failed to unsuspend user: HTTP 429');
      testError.statusCode = 429;

      const params = {
        userId: 'user123',
        address: 'https://example.okta.com',
        error: testError
      };

      const context = {
        secrets: {
          BEARER_AUTH_TOKEN: 'SSWS test-token'
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
        address: 'https://test.okta.com',
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