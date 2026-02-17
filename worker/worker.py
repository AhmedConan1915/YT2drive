import os
import sys
import logging
import json
import glob
from pymongo import MongoClient
from bson.objectid import ObjectId
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import yt_dlp

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_db():
    start_uri = os.environ.get("MONGO_URI")
    if not start_uri:
        logging.error("MONGO_URI not set")
        sys.exit(1)
    client = MongoClient(start_uri)
    return client.utube2drive

def get_job(db, job_id):
    try:
        if not job_id:
            return db.jobs.find_one({"status": "pending"}, sort=[("created_at", 1)])
        return db.jobs.find_one({"_id": ObjectId(job_id)})
    except Exception as e:
        logging.error(f"Error fetching job: {e}")
        return None

def update_job_status(db, job_id, status, error=None):
    update_doc = {"status": status}
    if error:
        update_doc["error"] = str(error)
    db.jobs.update_one({"_id": ObjectId(job_id)}, {"$set": update_doc})
    logging.info(f"Job {job_id} updated to {status}")

def get_drive_service(refresh_token, client_id, client_secret):
    creds = Credentials(
        None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=['https://www.googleapis.com/auth/drive.file']
    )
    return build('drive', 'v3', credentials=creds, cache_discovery=False)

def setup_cookies():
    cookie_content = os.environ.get("YOUTUBE_COOKIES")
    logging.info(f"Checking YOUTUBE_COOKIES... Present: {bool(cookie_content)}, Length: {len(cookie_content) if cookie_content else 0}")
    if cookie_content:
        logging.info("YOUTUBE_COOKIES found in env, creating cookies.txt")
        with open("cookies.txt", "w") as f:
            f.write(cookie_content)
        return "cookies.txt"
    return None


def process_video_download(ydl_opts, url, drive_service, db, job):
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        # 1. Extract Info first to get list of videos (or single video)
        try:
            info = ydl.extract_info(url, download=False)
        except Exception as e:
            # Re-raise to be caught by retry loop
            raise e
        
        if not info:
             raise Exception("Failed to extract video info (None returned). Check logs for yt-dlp errors.")

        if 'entries' in info:
            # Playlist
            video_items = info['entries']
        else:
            # Single video
            video_items = [info]

        video_items = [v for v in video_items if v] # Filter None entries
        
        if not video_items:
             raise Exception("No videos found. Check URL or Privacy settings.")
        
        logging.info(f"Found {len(video_items)} videos to process.")
        
        success_count = 0
        errors = []

        for item in video_items:
            video_id = item.get('id')
            title = item.get('title', 'Unknown')
            video_url = item.get('webpage_url') or item.get('url')
            
            logging.info(f"Processing: {title} ({video_id})")
            
            try:
                # Download specific video
                err_code = ydl.download([video_url])
                if err_code != 0:
                     raise Exception(f"yt-dlp download failed with code {err_code}")
                
                # Find the downloaded file
                files = glob.glob("*.mp4")
                if not files:
                     files = glob.glob("*.mkv") + glob.glob("*.webm")
                
                if not files:
                    raise Exception("Downloaded file not found")

                # Pick the file (should be only one if we clean up)
                filepath = files[0] 
                actual_filename = os.path.basename(filepath)
                logging.info(f"Uploading file: {actual_filename}")
                
                # Upload to Drive
                file_metadata = {'name': actual_filename} 
                media = MediaFileUpload(filepath, mimetype='video/mp4', resumable=True)
                
                drive_file = drive_service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id'
                ).execute()
                
                logging.info(f"Uploaded to Drive ID: {drive_file.get('id')}")
                
                # Cleanup
                os.remove(filepath)
                success_count += 1

            except Exception as e:
                logging.error(f"Failed to process {title}: {e}")
                errors.append(f"{title}: {str(e)}")
                # Clean up any potential leftovers
                for f in glob.glob("*.mp4") + glob.glob("*.mkv") + glob.glob("*.webm"):
                    try: os.remove(f)
                    except: pass
                # Re-raise authentication errors to trigger retry in main
                if "Sign in to confirm" in str(e) or "cookies are no longer valid" in str(e):
                    raise e

        if success_count == 0 and errors:
            raise Exception(f"All downloads failed. Errors: {'; '.join(errors)}")

        status = "completed" if not errors else "completed_with_errors"
        update_job_status(db, job['_id'], status)

def main():
    job_id = os.environ.get("JOB_ID")
    logging.info(f"Starting worker for Job ID: {job_id}")
    
    # Log versions
    try:
        import yt_dlp.version
        logging.info(f"yt-dlp version: {yt_dlp.version.__version__}")
    except:
        logging.warning("Could not check yt-dlp version")

    db = get_db()
    job = get_job(db, job_id)
    if not job:
        logging.info("No pending jobs found.")
        return

    update_job_status(db, job['_id'], "processing")
    
    try:
        CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
        CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
        if not CLIENT_ID or not CLIENT_SECRET:
             raise Exception("Missing Google Credentials in Env")

        drive_service = get_drive_service(job['user_refresh_token'], CLIENT_ID, CLIENT_SECRET)
        cookies_file = setup_cookies()
        
        url = job['youtube_url']
        logging.info(f"Processing URL: {url}")

        # Configure yt-dlp options
        ydl_opts = {
            'format': 'bestvideo+bestaudio/best',
            'merge_output_format': 'mp4',
            'outtmpl': '%(title)s.%(ext)s',
            'quiet': False,
            'no_warnings': False,
            'ignoreerrors': True, # Skip unavailable videos in playlist
            'restrictfilenames': True, # Avoid weird characters in filename
            'extractor_args': {
                'youtube': {
                    'player_client': ['android', 'web'],
                    'player_skip': ['webpage', 'configs'], 
                    'include_live_dash': True
                }
            },
            'compat_opts': {'no-live-chat', 'no-youtube-prefer-utc-upload-date', 'no-youtube-channel-redirect'}, 
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            # Allow remote components for JS challenge solving (e.g. for "n" parameter)
            # Corresponds to --remote-components ejs:github
            'remote_components': ['ejs:github'],
        }
        
        if cookies_file:
            ydl_opts['cookiefile'] = cookies_file
            
        # Retry loop for handling expired cookies
        max_retries = 1
        current_attempt = 0
        
        while current_attempt <= max_retries:
            try:
                process_video_download(ydl_opts, url, drive_service, db, job)
                break # Success, exit loop
            except Exception as e:
                error_msg = str(e)
                # Check for various auth-related errors
                # "Requested format is not available" often happens when cookies are invalid but yt-dlp sees them and restricts generic formats
                is_auth_error = any(msg in error_msg for msg in [
                    "Sign in to confirm", 
                    "cookies are no longer valid", 
                    "HTTP Error 403",
                    "Requested format is not available",
                    "Unable to extract video data"
                ])
                
                if is_auth_error and 'cookiefile' in ydl_opts:
                    logging.warning(f"Possible authentication failure with cookies: {e}")
                    logging.info("Retrying without cookies...")
                    del ydl_opts['cookiefile']
                    current_attempt += 1
                    continue
                else:
                    raise e # Not an auth error or no more retries

    except Exception as e:
        logging.error(f"Fatal error: {e}")
        update_job_status(db, job['_id'], "failed", error=e)
        sys.exit(1)
    finally:
        if 'cookies_file' in locals() and cookies_file and os.path.exists(cookies_file):
            os.remove(cookies_file)

if __name__ == "__main__":
    main()
