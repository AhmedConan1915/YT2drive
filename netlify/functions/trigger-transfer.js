const axios = require('axios');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405 };

    try {
        const { url, access_token, github_token, github_user, is_trial, folder } = JSON.parse(event.body);

        // Determine which repo and token to use
        let targetOwner, targetRepo, targetAuthToken;

        if (github_token && github_user) {
            // User is using their own worker
            targetOwner = github_user;
            targetRepo = 'utube2drive-worker';
            targetAuthToken = github_token;
        } else if (is_trial) {
            // User is using the developer's worker (limited trial)
            targetOwner = process.env.REPO_OWNER;
            targetRepo = process.env.REPO_NAME;
            targetAuthToken = process.env.GITHUB_PAT;
        } else {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'GitHub account linking required after trial.' })
            };
        }

        await axios.post(
            `https://api.github.com/repos/${targetOwner}/${targetRepo}/dispatches`,
            {
                event_type: 'start-transfer',
                client_payload: {
                    url: url,
                    access_token: access_token,
                    folder: folder || 'utube2drive'
                }
            },
            {
                headers: {
                    'Authorization': `token ${targetAuthToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Transfer queued successfully!' })
        };
    } catch (error) {
        console.error('Trigger error:', error.response?.data || error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to trigger transfer.',
                details: error.response?.data || error.message
            })
        };
    }
};
