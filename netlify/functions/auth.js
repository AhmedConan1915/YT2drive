const { google } = require('googleapis');

exports.handler = async (event) => {
    const protocol = event.headers['x-forwarded-proto'] || 'http';
    const host = event.headers.host;
    const siteUrl = `${protocol}://${host}`;

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
        prompt: 'consent'
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
