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
      <div className="container">
        <header>
          <h1>utube2drive</h1>
          <p className="subtitle">Transfer YouTube videos directly to your Google Drive</p>
        </header>

        {!user ? (
          <div className="auth-section">
            <button className="btn-primary" onClick={handleLogin}>
              Connect Google Drive
            </button>
            <p className="subtitle" style={{ marginTop: '1rem' }}>
              We need access to upload files to your Drive.
            </p>
          </div>
        ) : (
          <div className="app-content">
            <div className="user-profile-mini">
              <span>Connected as: <strong>{user.email}</strong></span>
              <button className="btn-logout" onClick={handleLogout}>Logout</button>
            </div>

            <form onSubmit={handleSubmit} className="transfer-form">
              <div className="input-group">
                <label>YouTube URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  required
                />
              </div>

              <div className="input-group">
                <label>Quality</label>
                <select value={quality} onChange={(e) => setQuality(e.target.value)}>
                  <option value="best">Best Available</option>
                  <option value="worst">Lowest (Data Saver)</option>
                  <option value="bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best">MP4 (Best Compatibility)</option>
                </select>
              </div>

              <div className="input-group">
                <label>Folder Name (Optional)</label>
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="e.g. My Music"
                />
              </div>

              <div className="input-group">
                <label>Custom Filename (Optional)</label>
                <input
                  type="text"
                  value={customFilename}
                  onChange={(e) => setCustomFilename(e.target.value)}
                  placeholder="e.g. Awesome Video"
                />
              </div>

              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Starting Transfer...' : 'Transfer to Drive'}
              </button>
            </form>

            {status && (
              <div className={`status-card ${status.includes('Error') ? 'error' : 'success'}`}>
                {status}
              </div>
            )}

            {jobId && (
              <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#666' }}>
                Check your Google Drive root folder in a few minutes.
                (Real-time progress updates coming soon!)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
