import { useState, useEffect } from 'react'
import axios from 'axios'
import './index.css'

function App() {
  const [user, setUser] = useState(null)
  const [url, setUrl] = useState('')
  const [quality, setQuality] = useState('best')
  const [folderName, setFolderName] = useState('')
  const [customFilename, setCustomFilename] = useState('')
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [jobId, setJobId] = useState(null)

  useEffect(() => {
    // Check for user in URL (returned from callback)
    const params = new URLSearchParams(window.location.search)
    const userId = params.get('userId')
    const email = params.get('email')
    const auth = params.get('auth')

    if (userId && email && auth === 'success') {
      const userData = { userId, email }
      setUser(userData)
      localStorage.setItem('utube2drive_user', JSON.stringify(userData))
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname)
    } else {
      // Check local storage
      const savedUser = localStorage.getItem('utube2drive_user')
      if (savedUser) {
        setUser(JSON.parse(savedUser))
      }
    }
  }, [])

  const handleLogin = () => {
    window.location.href = '/.netlify/functions/auth'
  }

  const handleLogout = () => {
    localStorage.removeItem('utube2drive_user')
    setUser(null)
    setStatus('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!url) return

    setIsSubmitting(true)
    setStatus('Submitting job...')

    try {
      const response = await axios.post('/.netlify/functions/submit_job', {
        userId: user.userId,
        youtube_url: url,
        quality,
        folderName,
        customFilename
      })

      if (response.data.jobId) {
        setJobId(response.data.jobId)
        setStatus(`Job submitted successfully! ID: ${response.data.jobId}. Transfer started in background.`)
        setUrl('')
      }
    } catch (error) {
      console.error(error)
      setStatus('Error submitting job: ' + (error.response?.data?.error || error.message))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="App">
      {!user ? (
        // LANDING PAGE FOR GUESTS
        <div className="landing-page">
          <section className="hero-section">
            <h1>Utube2drive</h1>
            <p className="subtitle">
              Professional YouTube to Drive Transfer. <br />
              Save videos directly to your cloud storage in seconds.
            </p>

            <button className="btn-primary" onClick={handleLogin}>
              Connect with Google Drive
            </button>
            <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Authentication required to access your Drive safely.
            </p>
          </section>

          <section className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🚀</div>
              <div className="feature-title">Fast Transfer</div>
              <div className="feature-desc">
                Direct server-to-server transfer. No need to download files to your device first.
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📂</div>
              <div className="feature-title">Custom Organization</div>
              <div className="feature-desc">
                Organize downloads into custom folders and rename files automatically.
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <div className="feature-title">Secure & Private</div>
              <div className="feature-desc">
                We use secure OAuth 2.0. Your data never leaves the direct connection to Google.
              </div>
            </div>
          </section>
        </div>
      ) : (
        // DASHBOARD FOR LOGGED-IN USERS
        <div className="container">
          <header>
            <h1>Dashboard</h1>
            <p className="subtitle">Manage your downloads</p>
          </header>

          <div className="user-profile-mini">
            <span>Signed in as <strong>{user.email}</strong></span>
            <button className="btn-logout" onClick={handleLogout}>Logout</button>
          </div>

          <div className="glass-card">
            <form onSubmit={handleSubmit} className="transfer-form">
              <div className="input-group">
                <label>YouTube URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste YouTube link here..."
                  required
                />
              </div>

              <div className="input-group">
                <label>Quality</label>
                <select value={quality} onChange={(e) => setQuality(e.target.value)}>
                  <option value="best">Best Available</option>
                  <option value="bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best">MP4 (Best Compatibility)</option>
                  <option value="worst">Data Saver (Low Quality)</option>
                </select>
              </div>

              <div className="input-group">
                <label>Folder Path (Optional)</label>
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="e.g. Music/Pop/2026"
                />
              </div>

              <div className="input-group">
                <label>Custom Filename (Optional)</label>
                <input
                  type="text"
                  value={customFilename}
                  onChange={(e) => setCustomFilename(e.target.value)}
                  placeholder="e.g. My Favorite Song"
                />
              </div>

              <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ width: '100%' }}>
                {isSubmitting ? 'Processing...' : 'Start Transfer'}
              </button>
            </form>

            {status && (
              <div className={`status-card ${status.includes('Error') ? 'error' : 'success'}`}>
                {status}
              </div>
            )}

            {jobId && (
              <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Job ID: {jobId} <br />
                Check your Drive folder in a few minutes.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
