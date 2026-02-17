const { google } = require('googleapis');
const { MongoClient } = require('mongodb');

let cachedDb = null;

async function connectToDatabase(uri) {
    if (cachedDb) return cachedDb;
    const client = await MongoClient.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
    cachedDb = client.db('utube2drive');
    return cachedDb;
}

exports.handler = async (event) => {
    const { code, state } = event.queryStringParameters;
    const protocol = event.headers['x-forwarded-proto'] || 'http';
    const host = event.headers.host;
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const siteUrl = isLocal ? `${protocol}://${host}` : (process.env.SITE_URL || `${protocol}://${host}`);

    if (!code) {
        return { statusCode: 400, body: 'Missing code parameter' };
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GDRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GDRIVE_CLIENT_SECRET;
    const mongoUri = process.env.MONGO_URI;

    if (!clientId || !clientSecret || !mongoUri) {
        return { statusCode: 500, body: 'Server misconfigured (secrets missing)' };
    }

    try {
        const oauth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            `${siteUrl}/.netlify/functions/callback`
        );

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Get user info to identify them
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const { email, name, picture } = userInfo.data;

        // Connect to MongoDB
        const db = await connectToDatabase(mongoUri);
        const users = db.collection('users');

        // Update or insert user
        const updateData = {
            email,
            name,
            picture,
            access_token: tokens.access_token,
            expiry_date: tokens.expiry_date,
            last_login: new Date()
        };

        if (tokens.refresh_token) {
            updateData.refresh_token = tokens.refresh_token;
        }

        const result = await users.findOneAndUpdate(
            { email },
            { $set: updateData },
            { returnDocument: 'after', upsert: true }
        );

        const userId = result.value ? result.value._id : result.lastErrorObject.upserted;

        // Redirect back to frontend
        let redirectTarget = state && state.startsWith('http') ? state : siteUrl;

        const redirectUrl = new URL(redirectTarget);
        redirectUrl.searchParams.set('userId', userId.toString());
        redirectUrl.searchParams.set('email', email);
        redirectUrl.searchParams.set('auth', 'success');

        return {
            statusCode: 302,
            headers: {
                Location: redirectUrl.toString(),
                'Cache-Control': 'no-cache',
            },
            body: '',
        };

    } catch (error) {
        console.error('Callback Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
