# Troubleshooting Guide

This guide explains common errors encountered by the worker and how to resolve them.

## Common Errors & Fixes

### 1. "Sign in to confirm you’re not a bot" / "Cookies are no longer valid"
**Symptom:** The worker logs an error about signing in or invalid cookies.
**Cause:** The cookies provided in the `YOUTUBE_COOKIES` environment variable have expired or are flagged by YouTube.
**Automatic Fix:** The worker is designed to **automatically retry** the download *without* cookies if this error occurs.
- **If the video is public**: The retry will succeed, and the video will be downloaded.
- **If the video is age-restricted/private**: The retry will fail (since cookies are required), and the job will be marked as failed.
**Manual Fix:**
- Export fresh cookies from your browser (use an extension like "Get cookies.txt").
- Update the `YOUTUBE_COOKIES` environment variable with the new content.

### 2. "Requested format is not available"
**Symptom:** Download fails with this message.
**Cause:**
- This often happens when invalid cookies are used. YouTube restricts the available formats for the "authenticated" user, leading `yt-dlp` to think no compatible format exists.
- Can also happen if `yt-dlp` cannot find a video/audio pair that matches the format criteria.
**Automatic Fix:**
- The worker treats this as an **authentication failure** and will retry without cookies.
- It also uses a fallback format (`best`) if the primary `bestvideo+bestaudio` merge fails.

### 3. "Failed to extract video info (None returned)"
**Symptom:** Fatal error in logs.
**Cause:** `yt-dlp` encountered an error (like "Sign in to confirm") but suppressed it due to configuration, returning `None` instead of video data.
**Automatic Fix:**
- The worker now catches this specific generic error and treats it as an authentication failure (if cookies were used), triggering the automatic retry.

### 4. "n challenge solving failed"
**Symptom:** Download is throttled or fails.
**Cause:** `yt-dlp` cannot solve YouTube's JavaScript challenge.
**Fix:** The worker now includes:
```python
'remote_components': ['ejs:github']
```
This allows `yt-dlp` to automatically download the necessary challenge solvers from GitHub.

## How to Update Cookies
If you need to download age-restricted content, you MUST provide valid cookies:
1.  **Install Extension**: Use "Get cookies.txt LOCALLY" for Chrome/Firefox.
2.  **Export**: Go to YouTube, log in, and export cookies for `youtube.com`.
3.  **Update Env**: Copy the content and set it as the `YOUTUBE_COOKIES` environment variable in your deployment (e.g., Render, Heroku, Docker).

## Checking Logs
Always check the worker logs for:
- `Attempt 1 failed. Retrying without cookies...` -> Confirming the auto-fix is working.
- `yt-dlp version` -> Ensure you are running a recent version (e.g., `2024.x.x` or later).
- `Processing URL` -> Verify the correct URL is being handled.
