exports.handler = async (event) => {
    const clientID = process.env.GITHUB_CLIENT_ID;
    const redirectURI = `${process.env.SITE_URL}/.netlify/functions/callback-github`;
    const scope = 'repo,workflow';

    const url = `https://github.com/login/oauth/authorize?client_id=${clientID}&redirect_uri=${encodeURIComponent(redirectURI)}&scope=${encodeURIComponent(scope)}&state=${Math.random().toString(36).substring(7)}`;

    return {
        statusCode: 302,
        headers: {
            Location: url,
            'Cache-Control': 'no-cache',
        },
        body: '',
    };
};
