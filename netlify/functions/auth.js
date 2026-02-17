const path = require('path');
const fs = require('fs');

if (!process.env.GOOGLE_CLIENT_ID && !process.env.GDRIVE_CLIENT_ID) {
    const rootEnvPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(rootEnvPath)) {
        require('dotenv').config({ path: rootEnvPath });
    }
}

const { google } = require('googleapis');

exports.handler = async (event) => {
    const protocol = event.headers['x-forwarded-proto'] || 'http';
    const host = event.headers.host;
    // For local testing (localhost), we MUST use the current host to ensure redirection comes back to this machine.
    // In production, we can use SITE_URL if set, or fall back to the host.
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const currentOrigin = `${protocol}://${host}`;
    const siteUrl = isLocal ? currentOrigin : (process.env.SITE_URL || currentOrigin);

    // Use GOOGLE_CLIENT_ID/SECRET as per prompt, but fallback to GDRIVE_ if set
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GDRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GDRIVE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.error('CRITICAL: Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'OAuth configuration missing on server.' })
        };
    }

    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        `${siteUrl}/.netlify/functions/callback`
    );

    const scopes = [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/drive.file'
    ];

    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Crucial for receiving a refresh_token
        scope: scopes,
        include_granted_scopes: true,
        prompt: 'consent', // Force consent prompt to ensure we get a refresh_token every time
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
