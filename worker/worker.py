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
    return build('drive', 'v3', credentials=creds)

def setup_cookies():
    cookie_content = os.environ.get("YOUTUBE_COOKIES")
    logging.info(f"Checking YOUTUBE_COOKIES... Present: {bool(cookie_content)}, Length: {len(cookie_content) if cookie_content else 0}")
    if cookie_content:
        logging.info("YOUTUBE_COOKIES found in env, creating cookies.txt")
        with open("cookies.txt", "w") as f:
            f.write(cookie_content)
        return "cookies.txt"
    return None

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
        }
        
        if cookies_file:
            ydl_opts['cookiefile'] = cookies_file

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # 1. Extract Info first to get list of videos (or single video)
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                raise Exception(f"Failed to fetch metadata: {e}")
            
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
                    # Since we use restrictfilenames, the filename might be slightly different than title
                    # But we can look for the most recently created mp4 file or use prepare_filename
                    
                    # Better approach: 
                    # yt-dlp prepare_filename might not match exactly after merge
                    # So we search for *.mp4 files in current dir (assuming we clean up)
                    
                    # Actually, since we process sequentially, we can just look for *.mp4
                    files = glob.glob("*.mp4")
                    if not files:
                        # Maybe it defaulted to mkv or webm if merge failed?
                         files = glob.glob("*.mkv") + glob.glob("*.webm")
                    
                    if not files:
                        raise Exception("Downloaded file not found")

                    # Pick the file (should be only one if we clean up)
                    filepath = files[0] # Just take the first one found
                    actual_filename = os.path.basename(filepath)
                    logging.info(f"Uploading file: {actual_filename}")
                    
                    # Upload to Drive
                    file_metadata = {'name': actual_filename} # Could use 'title' from metadata if preferred
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

            if success_count == 0 and errors:
                raise Exception(f"All downloads failed. Errors: {'; '.join(errors)}")

            status = "completed" if not errors else "completed_with_errors"
            update_job_status(db, job['_id'], status)

    except Exception as e:
        logging.error(f"Fatal error: {e}")
        update_job_status(db, job['_id'], "failed", error=e)
        sys.exit(1)
    finally:
        if 'cookies_file' in locals() and cookies_file and os.path.exists(cookies_file):
            os.remove(cookies_file)

if __name__ == "__main__":
    main()
