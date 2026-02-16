const { google } = require('googleapis');

exports.handler = async (event) => {
    const { code } = event.queryStringParameters;

    const protocol = event.headers['x-forwarded-proto'] || 'http';
    const host = event.headers.host;
    const siteUrl = `${protocol}://${host}`;

    const oauth2Client = new google.auth.OAuth2(
        process.env.GDRIVE_CLIENT_ID,
        process.env.GDRIVE_CLIENT_SECRET,
        `${siteUrl}/.netlify/functions/callback`
    );

    try {
        const { tokens } = await oauth2Client.getToken(code);

        // In a real app, you might set a cookie here. 
        // For this POC, we'll redirect back to the home page with the token in the hash
        // (Note: This is just for demonstration, normally tokens shouldn't be in the URL)
        const redirectUrl = `/#token=${tokens.access_token}&refresh_token=${tokens.refresh_token || ''}`;

        return {
            statusCode: 302,
            headers: {
                Location: redirectUrl,
                'Cache-Control': 'no-cache',
            },
            body: '',
        };
    } catch (error) {
        console.error('Error in OAuth callback:', error);
        return {
            statusCode: 500,
            body: 'Authentication failed',
        };
    }
};
