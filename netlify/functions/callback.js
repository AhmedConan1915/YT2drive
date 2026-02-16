const { google } = require('googleapis');

exports.handler = async (event) => {
    const { code } = event.queryStringParameters;

    const protocol = event.headers['x-forwarded-proto'] || 'http';
    const host = event.headers.host;
    const siteUrl = process.env.SITE_URL || `${protocol}://${host}`;

    const oauth2Client = new google.auth.OAuth2(
        process.env.GDRIVE_CLIENT_ID,
        process.env.GDRIVE_CLIENT_SECRET,
        `${siteUrl}/.netlify/functions/callback`
    );

    try {
        const { state } = event.queryStringParameters;
        const origin = state || siteUrl;

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();

        const userData = {
            name: userInfo.data.name,
            email: userInfo.data.email,
            picture: userInfo.data.picture
        };

        const redirectUrl = `${origin}/#token=${tokens.access_token}&refresh_token=${tokens.refresh_token || ''}&user=${encodeURIComponent(JSON.stringify(userData))}`;

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
