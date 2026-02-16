const { google } = require('googleapis');

exports.handler = async (event) => {
    const protocol = event.headers['x-forwarded-proto'] || 'http';
    const host = event.headers.host;
    // For the actual redirect_uri (registered in Google/GitHub), we use the fixed SITE_URL if available.
    // But for the 'state' (our teleportation target), we MUST use the current host.
    const currentOrigin = `${protocol}://${host}`;
    const siteUrl = process.env.SITE_URL || currentOrigin;

    const oauth2Client = new google.auth.OAuth2(
        process.env.GDRIVE_CLIENT_ID,
        process.env.GDRIVE_CLIENT_SECRET,
        `${siteUrl}/.netlify/functions/callback`
    );

    const scopes = [
        'openid',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.install'
    ];

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent',
        state: currentOrigin
    });

    return {
        statusCode: 302,
        headers: {
            Location: url,
            'Cache-Control': 'no-cache',
        },
        body: '',
    };
};
