/**
 * Okta Unsuspend User Action
 *
 * Unsuspends an Okta user account, allowing them to log in again.
 * The user transitions from SUSPENDED status back to ACTIVE status.
 */

import { getBaseURL, createAuthHeaders} from '@sgnl-actions/utils';

// Okta user status constants
const USER_STATUS = {
  SUSPENDED: 'SUSPENDED'
};

/**
 * Helper function to create an error with status code
 * @private
 */
function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Helper function to perform user unsuspension
 * @private
 */
async function unsuspendUser(userId, baseUrl, headers) {
  // Safely encode userId to prevent injection
  const encodedUserId = encodeURIComponent(userId);

  // Build URL using base URL (already cleaned by getBaseUrl)
  const url = `${baseUrl}/api/v1/users/${encodedUserId}/lifecycle/unsuspend`;

  const response = await fetch(url, {
    method: 'POST',
    headers
  });

  return response;
}

/**
 * Helper function to get user details
 * @private
 */
async function getUser(userId, baseUrl, headers) {
  // Safely encode userId to prevent injection
  const encodedUserId = encodeURIComponent(userId);

  // Build URL using base URL (already cleaned by getBaseUrl)
  const url = `${baseUrl}/api/v1/users/${encodedUserId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: headers
  });

  return response;
}

export default {
  /**
   * Main execution handler - unsuspends the specified Okta user
   * @param {Object} params - Job input parameters
   * @param {string} params.userId - The Okta user ID
   * @param {string} params.address - Full URL to Okta API (defaults to ADDRESS environment variable)
   *
   * @param {Object} context - Execution context with secrets and environment
   * @param {string} context.environment.ADDRESS - Okta API base URL
   *
   * The configured auth type will determine which of the following environment variables and secrets are available
   * @param {string} context.secrets.BEARER_AUTH_TOKEN
   *
   * @param {string} context.secrets.BASIC_USERNAME
   * @param {string} context.secrets.BASIC_PASSWORD
   *
   * @param {string} context.secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_AUDIENCE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_AUTH_STYLE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_CLIENT_ID
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_SCOPE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_TOKEN_URL
   *
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN
   *
   * @returns {Object} Job results
   */
  invoke: async (params, context) => {

    const { userId } = params;

    console.log(`Starting Okta user unsuspension for user: ${userId}`);

    // Get base URL using utility function
    const baseUrl = getBaseURL(params, context);

    // Get headers using utility function
    let headers = await createAuthHeaders(context);

    // Handle Okta's SSWS token format - only for Bearer token auth mode
    if (context.secrets.BEARER_AUTH_TOKEN && headers['Authorization'].startsWith('Bearer ')) {
      const token = headers['Authorization'].substring(7);
      headers['Authorization'] = token.startsWith('SSWS ') ? token : `SSWS ${token}`;
    }

    // Make the API request to unsuspend the user
    const unsuspendUserResponse = await unsuspendUser(userId, baseUrl, headers);
    console.log(`Receieved a ${unsuspendUserResponse.status} from Okta when unsuspending user ${userId}`)

    if (!unsuspendUserResponse.ok && unsuspendUserResponse.status !== 400) {
       // Handle error responses
      let errorMessage = `Failed to unsuspend user: HTTP ${unsuspendUserResponse.status}`;

      try {
        const errorBody = await unsuspendUserResponse.json();
        if (errorBody.errorSummary) {
          errorMessage = `Failed to unsuspend user: ${errorBody.errorSummary}`;
        }
        console.error('Okta API error response:', errorBody);
      } catch {
        // Response might not be JSON
        console.error('Failed to parse error response');
      }

      throw createError(errorMessage, unsuspendUserResponse.status);
    }

    // Get user to confirm status change
    const getUserResponse = await getUser(userId, baseUrl, headers)
    if (!getUserResponse.ok) {
      const errorMessage = `Cannot fetch information about User: HTTP ${getUserResponse.status}`;
      console.error(errorMessage);
      throw createError(errorMessage, getUserResponse.status);
    }

    let userData;
    try {
      userData = await getUserResponse.json();
    } catch (err) {
      const errorMessage = `Cannot parse user data: ${err.message}`;
      console.error(errorMessage);
      throw createError(errorMessage, 500);
    }

    // Check if user now active
    if (userData.status === USER_STATUS.SUSPENDED) {
      const errorMessage = `User ${userId} could not be unsuspended. User is currently ${userData.status}`
      console.error(errorMessage);
      throw createError(errorMessage, 400);
    }

    // Successfully suspended user
    console.log(`Fetched user info. User ${userId} is unsuspended with a status of ${userData.status}.`);
    return {
      userId,
      unsuspended: true,
      address: baseUrl,
      unsuspendedAt: userData.statusChanged || userData.lastUpdated,
      status: userData.status
    };
  },

  /**
   * Error recovery handler - framework handles retries by default
   * Only implement if custom recovery logic is needed
   * @param {Object} params - Original params plus error information
   * @param {Object} context - Execution context
   * @returns {Object} Recovery results
   */
  error: async (params, _context) => {
    const { error, userId } = params;
    console.error(`User unsuspension failed for user ${userId}: ${error.message}`);

    // Framework handles retries for transient errors (429, 502, 503, 504)
    // Just re-throw the error to let the framework handle it
    throw error;
  },

  /**
   * Graceful shutdown handler - cleanup when job is halted
   * @param {Object} params - Original params plus halt reason
   * @param {Object} context - Execution context
   * @returns {Object} Cleanup results
   */
  halt: async (params, _context) => {
    const { reason, userId } = params;
    console.log(`User unsuspension job is being halted (${reason}) for user ${userId}`);

    // No cleanup needed for this simple operation
    // The POST request either completed or didn't

    return {
      userId: userId || 'unknown',
      reason: reason,
      haltedAt: new Date().toISOString(),
      cleanupCompleted: true
    };
  }
};