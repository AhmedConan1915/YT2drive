import { useState, useEffect } from 'react'
import './index.css'

function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user_profile')
    return savedUser ? JSON.parse(savedUser) : null
  })
  const [authMode, setAuthMode] = useState(localStorage.getItem('user_profile') ? 'authenticated' : 'login')
  const [isLinked, setIsLinked] = useState(localStorage.getItem('gdrive_linked') === 'true')
  const [url, setUrl] = useState('')
  const [folder, setFolder] = useState('utube2drive')
  const [isTransferring, setIsTransferring] = useState(false)
  const [status, setStatus] = useState('')
  const [accessToken, setAccessToken] = useState(localStorage.getItem('gdrive_token') || '')
  const [progressStatus, setProgressStatus] = useState(null)

  // New state for GitHub worker
  const [githubToken, setGithubToken] = useState(localStorage.getItem('gh_token') || '')
  const [githubUser, setGithubUser] = useState(localStorage.getItem('gh_user') || '')
  const [transferCount, setTransferCount] = useState(parseInt(localStorage.getItem('t_count') || '0'))
  const [isSettingUpWorker, setIsSettingUpWorker] = useState(false)

  // Manual PAT state
  const [showManualMode, setShowManualMode] = useState(false)
  const [manualToken, setManualToken] = useState('')

  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return

    const params = new URLSearchParams(hash.substring(1))

    // Handle User Data
    const rawUser = params.get('user')
    if (rawUser) {
      const decodedUser = JSON.parse(decodeURIComponent(rawUser))
      setUser(decodedUser)
      localStorage.setItem('user_profile', JSON.stringify(decodedUser))
      setAuthMode('authenticated')
    }

    // Handle GDrive token
    const driveToken = params.get('access_token') || params.get('token')
    if (driveToken) {
      setAccessToken(driveToken)
      setIsLinked(true)
      localStorage.setItem('gdrive_token', driveToken)
      localStorage.setItem('gdrive_linked', 'true')
      setStatus('Google Drive linked!')
      window.history.replaceState(null, '', window.location.pathname)
    }

    // Handle GitHub token
    const ghToken = params.get('github_token')
    if (ghToken) {
      setGithubToken(ghToken)
      localStorage.setItem('gh_token', ghToken)
      setupWorker(ghToken)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const setupWorker = async (token) => {
    setIsSettingUpWorker(true)
    setStatus('Setting up your personal worker repository...')
    try {
      const res = await fetch('/.netlify/functions/setup-worker', {
        method: 'POST',
        body: JSON.stringify({ github_token: token })
      })
      const data = await res.json()
      if (res.ok) {
        setGithubUser(data.username)
        localStorage.setItem('gh_user', data.username)
        setStatus('Personal worker ready!')
      } else {
        setStatus('GitHub setup failed: ' + data)
      }
    } catch (err) {
      setStatus('Error setting up worker.')
    } finally {
      setIsSettingUpWorker(false)
    }
  }

  const handleLinkGithub = () => {
    window.location.href = '/.netlify/functions/auth-github'
  }

  const pollStatus = async () => {
    const check = async () => {
      try {
        const res = await fetch('/.netlify/functions/get-status', {
          method: 'POST',
          body: JSON.stringify({
            github_token: githubToken,
            github_user: githubUser,
            is_trial: transferCount < 1
          })
        });
        const data = await res.json();
        setProgressStatus(data);

        if (data.status === 'completed' || data.conclusion === 'failure') {
          setIsTransferring(false);
          setStatus(data.conclusion === 'success' ? 'Transfer complete!' : 'Transfer failed. Check logs.');
          return true; // Stop polling
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
      return false;
    };

    const interval = setInterval(async () => {
      const stop = await check();
      if (stop) clearInterval(interval);
    }, 5000);

    check(); // Initial check
  };

  const handleTransfer = async (e) => {
    e.preventDefault()
    if (!url || !accessToken) return

    const needsGithub = transferCount >= 1 && !githubToken
    if (needsGithub) {
      setStatus('Your free trial is over. Please link your GitHub to continue.')
      return
    }

    setIsTransferring(true)
    setStatus('Preparing secure cloud stream...')
    setProgressStatus({ status: 'queued' })

    try {
      const response = await fetch('/.netlify/functions/trigger-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          folder,
          access_token: accessToken,
          github_token: githubToken,
          github_user: githubUser,
          is_trial: transferCount < 1
        }),
      })

      if (response.ok) {
        const newCount = transferCount + 1
        setTransferCount(newCount)
        localStorage.setItem('t_count', newCount.toString())
        setStatus('Transfer queued! Tracking progress...')
        pollStatus();
      } else {
        const errorData = await response.json();
        setStatus('Failed to trigger transfer: ' + (errorData.error || 'Unknown error'));
        setIsTransferring(false)
        setProgressStatus(null)
      }
    } catch (err) {
      console.error('Transfer error:', err)
      setStatus('An error occurred while connecting to the cloud.')
      setIsTransferring(false)
      setProgressStatus(null)
    }
  }

  // UI helpers
  const isTrialFinished = transferCount >= 1
  const showGithubLink = !githubToken
  const isRunning = isTransferring || (progressStatus && (progressStatus.status === 'in_progress' || progressStatus.status === 'queued'))

  return (
    <div className="App">
      <div className="bg-blobs"><div className="blob"></div><div className="blob blob-2"></div></div>
      <div className="container">
        <header>
          <h1>utube2drive</h1>
          <p className="subtitle">Cloud-to-Cloud YouTube Downloader</p>
        </header>

        {authMode !== 'authenticated' ? (
          <div className="auth-section">
            <button className="btn-primary" onClick={() => window.location.href = '/.netlify/functions/auth'}>
              Login with Google
            </button>
            <p className="subtitle" style={{ marginTop: '1rem' }}>Securely access your Drive to start transfers</p>
          </div>
        ) : (
          <div className="app-content">
            <div className="user-profile-mini">
              {user?.picture && <img src={user.picture} alt={user.name} className="user-avatar" />}
              <div className="user-info">
                <span className="user-name">{user?.name || 'User'}</span>
                <span className="user-email">{user?.email}</span>
              </div>
            </div>
            {!isLinked ? (
              <div className="auth-step">
                <span className="label-badge">Step 1: Authorization</span>
                <h3>Connect Google Drive</h3>
                <p className="subtitle" style={{ marginBottom: '2rem' }}>Required to save videos to your account.</p>
                <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => window.location.href = '/.netlify/functions/auth'}>
                  Link My Drive
                </button>
              </div>
            ) : (
              <form onSubmit={handleTransfer}>
                <span className="label-badge">{isTransferring ? 'Active Transfer' : 'New Transfer'}</span>

                <div className="input-group">
                  <label>YouTube Link (Video or Playlist)</label>
                  <input
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://youtube.com/..."
                    disabled={isRunning}
                  />
                </div>

                <div className="input-group">
                  <label>Destination Folder</label>
                  <input
                    value={folder}
                    onChange={e => setFolder(e.target.value)}
                    placeholder="utube2drive"
                    disabled={isRunning}
                  />
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                    * We only add files, never delete.
                  </p>
                </div>

                {isRunning && progressStatus && (
                  <div className="progress-container">
                    <span className="label-badge" style={{ background: 'rgba(14, 165, 233, 0.2)' }}>
                      {progressStatus.status === 'queued' ? 'Initializing' : 'Transferring'}...
                    </span>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: progressStatus.status === 'queued' ? '15%' : '65%' }}></div>
                    </div>
                    <div className="status-grid">
                      <div className="status-mini-card">
                        <label>Status</label>
                        <span className={isRunning ? 'loading-dots' : ''}>
                          {progressStatus.status === 'queued' ? 'In Queue' : 'Active'}
                        </span>
                      </div>
                      <div className="status-mini-card">
                        <label>Target</label>
                        <span style={{ fontSize: '0.7rem' }}>{folder}/</span>
                      </div>
                    </div>
                  </div>
                )}

                {!isRunning && (
                  <>
                    <button
                      type="submit"
                      className="btn-primary btn-pulse"
                      style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}
                      disabled={!url || (isTrialFinished && !githubToken)}
                    >
                      {isTrialFinished && !githubToken ? 'Link GitHub to Continue' : 'Start Transfer'}
                    </button>

                    {showGithubLink && (
                      <div className="gh-callout">
                        <span className="label-badge">GitHub Cloud Worker</span>
                        <p>{isTrialFinished ? "Trial over!" : "Optional:"} Setup your own private transfer engine to remove all limits.</p>

                        <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={handleLinkGithub} disabled={isSettingUpWorker}>
                          {isSettingUpWorker ? "Configuring..." : "Link My GitHub Account"}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {!githubToken && !isTrialFinished && <p className="trial-badge">1 Free Trial Available</p>}
              </form>
            )}
          </div>
        )}

        {status && <div className="status-card">{status}</div>}

        <div className="setup-guide-container">
          <h2>How it Works</h2>
          <div className="setup-steps">
            <div className="step">
              <span className="step-num">01</span>
              <h4>Cloud Link</h4>
              <p>Connect your Google Drive securely to establish the transfer destination.</p>
            </div>
            <div className="step">
              <span className="step-num">02</span>
              <h4>Free Trial</h4>
              <p>Experience zero-bandwidth transfers immediately with our managed trial worker.</p>
            </div>
            <div className="step">
              <span className="step-num">03</span>
              <h4>Personal Worker</h4>
              <p>Link GitHub to scale. We'll deploy an automated, private worker repo in your account.</p>
            </div>
          </div>
        </div>

        <section className="info-grid">
          <div className="info-card">
            <h3>Zero Bandwidth</h3>
            <p>Direct cloud-to-cloud streams bypass your device data and local network completely.</p>
          </div>
          <div className="info-card">
            <h3>Isolated Security</h3>
            <p>Your transfers run in your own private environments with end-to-end encryption.</p>
          </div>
          <div className="info-card">
            <h3>Infinite Scalability</h3>
            <p>Leverage cloud infrastructure to handle 4K videos and massive playlists with ease.</p>
          </div>
        </section>

        <footer className="credits">DESIGNED & DEVELOPED BY <span>AHMED EMAD</span></footer>
      </div>
    </div>
  )
}

export default App
