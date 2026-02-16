const axios = require('axios');

exports.handler = async (event) => {
    const { code } = event.queryStringParameters;

    try {
        const { state } = event.queryStringParameters;
        const origin = state || '';

        const response = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code: code,
        }, {
            headers: {
                Accept: 'application/json'
            }
        });

        const { access_token } = response.data;
        const redirectUrl = `${origin}/#github_token=${access_token}`;

        return {
            statusCode: 302,
            headers: {
                Location: redirectUrl,
                'Cache-Control': 'no-cache',
            },
            body: '',
        };
    } catch (error) {
        console.error('Error in GitHub OAuth callback:', error);
        return {
            statusCode: 500,
            body: 'GitHub Authentication failed',
        };
    }
};
