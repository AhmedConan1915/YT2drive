const path = require('path');
const fs = require('fs');

if (!process.env.MONGO_URI) {
    const rootEnvPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(rootEnvPath)) {
        require('dotenv').config({ path: rootEnvPath });
    }
}

const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');

let cachedDb = null;

async function connectToDatabase(uri) {
    if (cachedDb) return cachedDb;
    const client = await MongoClient.connect(uri);
    cachedDb = client.db('utube2drive');
    return cachedDb;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { userId, youtube_url, quality, folderName, customFilename } = JSON.parse(event.body);

    if (!userId || !youtube_url) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing userId or youtube_url' }) };
    }

    const mongoUri = process.env.MONGO_URI;
    const githubPat = process.env.GITHUB_PAT;
    // .env uses REPO_OWNER/NAME, so we support both
    const githubOwner = process.env.GITHUB_OWNER || process.env.REPO_OWNER;
    const githubRepo = process.env.GITHUB_REPO || process.env.REPO_NAME;

    if (!mongoUri) console.error("Missing MONGO_URI");
    if (!githubPat) console.error("Missing GITHUB_PAT");
    if (!githubOwner) console.error("Missing GITHUB_OWNER (or REPO_OWNER)");
    if (!githubRepo) console.error("Missing GITHUB_REPO (or REPO_NAME)");

    if (!mongoUri || !githubPat || !githubOwner || !githubRepo) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured (secrets missing). Check terminal logs.' }) };
    }

    try {
        const db = await connectToDatabase(mongoUri);
        const users = db.collection('users');
        const jobs = db.collection('jobs');

        // verify user and get refresh token
        const user = await users.findOne({ _id: new ObjectId(userId) });
        if (!user || !user.refresh_token) {
            return { statusCode: 401, body: JSON.stringify({ error: 'User not authenticated or missing refresh token' }) };
        }

        // Save job
        const job = {
            userId: new ObjectId(userId),
            youtube_url,
            quality: quality || 'best',
            folder_name: folderName, // NEW
            custom_filename: customFilename, // NEW
            user_refresh_token: user.refresh_token, // Encrypt this in production!
            status: 'pending',
            created_at: new Date()
        };

        const result = await jobs.insertOne(job);
        const jobId = result.insertedId;

        // Trigger GitHub Action
        // We can use 'workflow_dispatch' if we know the workflow id/filename, or 'repository_dispatch'
        const workflowUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/worker.yml/dispatches`;

        await axios.post(workflowUrl, {
            ref: 'master',
            inputs: {
                jobId: jobId.toString()
            }
        }, {
            headers: {
                'Authorization': `Bearer ${githubPat}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Job submitted', jobId: jobId })
        };

    } catch (error) {
        console.error('Submit Job Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
