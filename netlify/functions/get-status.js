const axios = require('axios');

exports.handler = async (event) => {
    try {
        const { github_token, github_user, is_trial } = JSON.parse(event.body);

        // Determine which repo to poll
        let targetOwner, targetRepo, targetAuthToken;
        if (github_token && github_user) {
            targetOwner = github_user;
            targetRepo = 'utube2drive-worker';
            targetAuthToken = github_token;
        } else if (is_trial) {
            targetOwner = process.env.REPO_OWNER;
            targetRepo = process.env.REPO_NAME;
            targetAuthToken = process.env.GITHUB_PAT;
        } else {
            return { statusCode: 403, body: 'Not authorized' };
        }

        const response = await axios.get(
            `https://api.github.com/repos/${targetOwner}/${targetRepo}/actions/runs?per_page=1`,
            {
                headers: {
                    'Authorization': `token ${targetAuthToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        const latestRun = response.data.workflow_runs[0];
        if (!latestRun) {
            return { statusCode: 200, body: JSON.stringify({ status: 'no_runs' }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                status: latestRun.status, // queued, in_progress, completed
                conclusion: latestRun.conclusion, // success, failure, cancelled
                updated_at: latestRun.updated_at,
                run_url: latestRun.html_url
            })
        };
    } catch (error) {
        console.error('Status fetch error:', error.message);
        return { statusCode: 500, body: 'Failed to fetch status' };
    }
};
