import { useState, useEffect } from 'react'
import './index.css'

function App() {
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [isLinked, setIsLinked] = useState(false)
  const [url, setUrl] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)
  const [status, setStatus] = useState('')
  const [accessToken, setAccessToken] = useState('')

  // New state for GitHub worker
  const [githubToken, setGithubToken] = useState(localStorage.getItem('gh_token') || '')
  const [githubUser, setGithubUser] = useState(localStorage.getItem('gh_user') || '')
  const [transferCount, setTransferCount] = useState(parseInt(localStorage.getItem('t_count') || '0'))
  const [isSettingUpWorker, setIsSettingUpWorker] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return

    const params = new URLSearchParams(hash.substring(1))

    // Handle GDrive token
    const driveToken = params.get('access_token')
    if (driveToken) {
      setAccessToken(driveToken)
      setIsLinked(true)
      setUser({ email: 'user@example.com', name: 'User' })
      setAuthMode('authenticated')
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

  const handleTransfer = async (e) => {
    e.preventDefault()
    if (!url || !accessToken) return

    const needsGithub = transferCount >= 1 && !githubToken
    if (needsGithub) {
      setStatus('Your free trial is over. Please link your GitHub to continue.')
      return
    }

    setIsTransferring(true)
    setStatus('Queueing transfer...')

    try {
      const response = await fetch('/.netlify/functions/trigger-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
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
        setStatus('Transfer started! You can close this tab.')
        setUrl('')
      } else {
        setStatus('Failed to trigger transfer.')
      }
    } catch (err) {
      setStatus('An error occurred.')
    } finally {
      setIsTransferring(false)
    }
  }

  // UI helpers
  const isTrialFinished = transferCount >= 1
  const showGithubLink = !githubToken && (isTrialFinished || authMode === 'authenticated')

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
            <button className="btn-primary" onClick={() => {
              setUser({ email: 'guest@example.com', name: 'Guest' })
              setAuthMode('authenticated')
            }}>Start Using App</button>
            <p className="subtitle" style={{ marginTop: '1rem' }}>No account needed to start trial</p>
          </div>
        ) : (
          <div className="app-content">
            {!isLinked ? (
              <button className="btn-primary" onClick={() => window.location.href = '/.netlify/functions/auth'}>
                Link Google Drive
              </button>
            ) : (
              <form onSubmit={handleTransfer}>
                <div className="input-group">
                  <label>YouTube URL</label>
                  <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste link here..." />
                </div>

                {showGithubLink && (
                  <div className="gh-callout">
                    <p>{isTrialFinished ? "Trial over!" : "Optional:"} Link your GitHub to use your own minutes.</p>
                    <button type="button" className="btn-secondary" onClick={handleLinkGithub} disabled={isSettingUpWorker}>
                      {isSettingUpWorker ? "Setting up..." : "Link GitHub"}
                    </button>
                  </div>
                )}

                <button type="submit" className="btn-primary" disabled={isTransferring || (isTrialFinished && !githubToken)}>
                  {isTransferring ? 'Starting...' : isTrialFinished && !githubToken ? 'Link GitHub to Continue' : 'Transfer to Drive'}
                </button>
                {!githubToken && !isTrialFinished && <p className="trial-badge">1 Free Trial Remaining</p>}
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
