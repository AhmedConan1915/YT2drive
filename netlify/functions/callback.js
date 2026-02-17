const path = require('path');
const fs = require('fs');

// 1. Try to verify if MONGO_URI is already loaded by Netlify CLI
if (!process.env.MONGO_URI) {
    // 2. If not, manually load from the project root using process.cwd()
    const rootEnvPath = path.resolve(process.cwd(), '.env');
    console.log(`[Debug] Loading .env from: ${rootEnvPath}`);

    if (fs.existsSync(rootEnvPath)) {
        require('dotenv').config({ path: rootEnvPath });
    } else {
        console.warn("[Warning] .env file not found at project root!");
    }
}

const { google } = require('googleapis');
const { MongoClient } = require('mongodb');

// DEBUG LOGGING
console.log("Loading callback.js...");
console.log("MONGO_URI is set:", !!process.env.MONGO_URI);
console.log("GOOGLE_CLIENT_ID is set:", !!(process.env.GOOGLE_CLIENT_ID || process.env.GDRIVE_CLIENT_ID));

let cachedDb = null;

async function connectToDatabase(uri) {
    if (cachedDb) return cachedDb;
    const client = await MongoClient.connect(uri);
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

    if (!clientId) console.error("Missing GOOGLE_CLIENT_ID");
    if (!clientSecret) console.error("Missing GOOGLE_CLIENT_SECRET");
    if (!mongoUri) console.error("Missing MONGO_URI");

    if (!clientId || !clientSecret || !mongoUri) {
        return { statusCode: 500, body: 'Server misconfigured (secrets missing). Check terminal logs for details.' };
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

        // MongoDB driver v4+ returns { value: ... } or just the doc depending on version/options.
        // If result is the doc itself (v5+ default with includeResultMetadata: false), use it.
        // Safest access for v4/v5 compatibility:
        const userDoc = result.value || result;
        const userId = userDoc._id;

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
