const { google } = require('googleapis');

exports.handler = async (event) => {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GDRIVE_CLIENT_ID,
        process.env.GDRIVE_CLIENT_SECRET,
        `${process.env.SITE_URL}/.netlify/functions/callback`
    );

    const scopes = [
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
