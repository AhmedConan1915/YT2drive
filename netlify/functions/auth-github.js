exports.handler = async (event) => {
    const clientID = process.env.GITHUB_CLIENT_ID;
    const protocol = event.headers['x-forwarded-proto'] || 'http';
    const host = event.headers.host;
    const siteUrl = process.env.SITE_URL || `${protocol}://${host}`;
    const redirectURI = `${siteUrl}/.netlify/functions/callback-github`;

    console.log('GitHub Auth - SITE_URL:', process.env.SITE_URL);
    console.log('GitHub Auth - Redirect URI:', redirectURI);

    const scope = 'repo,workflow';

    const url = `https://github.com/login/oauth/authorize?client_id=${clientID}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(siteUrl)}`;

    return {
        statusCode: 302,
        headers: {
            Location: url,
            'Cache-Control': 'no-cache',
        },
        body: '',
    };
};
