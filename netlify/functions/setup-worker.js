const axios = require('axios');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405 };

    try {
        const { github_token } = JSON.parse(event.body);
        const repoName = 'YT2drive-worker';
        const authHeaders = {
            'Authorization': `token ${github_token}`,
            'Accept': 'application/vnd.github.v3+json'
        };

        // 1. Get user info
        const userRes = await axios.get('https://api.github.com/user', { headers: authHeaders });
        const username = userRes.data.login;

        // 2. Check if repo exists
        let repoExists = false;
        try {
            await axios.get(`https://api.github.com/repos/${username}/${repoName}`, { headers: authHeaders });
            repoExists = true;
        } catch (e) {
            repoExists = false;
        }

        // 3. Create repo if not exists
        if (!repoExists) {
            await axios.post('https://api.github.com/user/repos', {
                name: repoName,
                private: true,
                description: 'Auto-generated worker for YT2drive'
            }, { headers: authHeaders });
        }

        // 4. Upsert workflow file
        const workflowPath = '.github/workflows/transfer.yml';
        const workflowContent = `name: Transfer Video to GDrive
on:
  repository_dispatch:
    types: [start-transfer]
jobs:
  transfer:
    runs-on: ubuntu-latest
    steps:
      - name: Install yt-dlp
        run: pip install yt-dlp
      - name: Install rclone
        run: curl https://rclone.org/install.sh | sudo bash
      - name: Configure rclone
        run: |
          mkdir -p ~/.config/rclone
          cat <<EOF > ~/.config/rclone/rclone.conf
          [gdrive]
          type = drive
          scope = drive
          token = {"access_token":"\${{ github.event.client_payload.access_token }}","token_type":"Bearer"}
          client_id = \${{ secrets.GDRIVE_CLIENT_ID }}
          client_secret = \${{ secrets.GDRIVE_CLIENT_SECRET }}
          EOF
      - name: Download and Upload
        run: |
          yt-dlp -f "bestvideo+bestaudio/best" --merge-output-format mp4 --yes-playlist "\${{ github.event.client_payload.url }}" -o "downloads/%(title)s.%(ext)s"
          rclone copy downloads/ gdrive:YT2drive/ --progress`;

        const base64Content = Buffer.from(workflowContent).toString('base64');

        // Get file SHA if exists to update
        let sha;
        try {
            const fileRes = await axios.get(`https://api.github.com/repos/${username}/${repoName}/contents/${workflowPath}`, { headers: authHeaders });
            sha = fileRes.data.sha;
        } catch (e) { }

        await axios.put(`https://api.github.com/repos/${username}/${repoName}/contents/${workflowPath}`, {
            message: 'Set up YT2drive worker workflow',
            content: base64Content,
            sha: sha
        }, { headers: authHeaders });

        return {
            statusCode: 200,
            body: JSON.stringify({ username, repoName })
        };
    } catch (error) {
        console.error('Setup worker error:', error.response?.data || error.message);
        return { statusCode: 500, body: JSON.stringify(error.response?.data || error.message) };
    }
};
