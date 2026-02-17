import os
import sys
import json
import logging
import subprocess
import requests
from pymongo import MongoClient
from bson.objectid import ObjectId
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import io

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

def get_video_items(youtube_url, cookies_file=None):
    # Retrieve metadata (flat playlist) to handle single video or playlist
    cmd = [
        "yt-dlp", "--dump-json", "--flat-playlist", "--no-warnings", 
        "--js-runtimes", "node",
        "--extractor-args", "youtube:player_client=ios"
    ]
    if cookies_file:
        cmd.extend(["--cookies", cookies_file])
    
    cmd.append(youtube_url)

    try:
        logging.info(f"Fetching metadata for: {youtube_url}")
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate()
        
        if process.returncode != 0:
            logging.error(f"yt-dlp metadata fetch failed: {stderr}")
            raise Exception(f"Failed to fetch metadata: {stderr}")

        items = []
        for line in stdout.strip().split('\n'):
            if line:
                try:
                    data = json.loads(line)
                    items.append({
                        'id': data.get('id'),
                        'title': data.get('title', 'Unknown Title'),
                        'url': data.get('url') or data.get('webpage_url') or f"https://www.youtube.com/watch?v={data.get('id')}"
                    })
                except json.JSONDecodeError:
                    pass
        return items
    except Exception as e:
        raise e

def stream_video_to_drive(video_url, drive_service, quality='best', cookies_file=None):
    # Get filename for this specific video
    cmd_info = ["yt-dlp", "--get-filename", "-o", "%(title)s.%(ext)s", "--js-runtimes", "node"]
    if cookies_file:
        cmd_info.extend(["--cookies", cookies_file])
    cmd_info.append(video_url)
    
    try:
        filename = subprocess.check_output(cmd_info).decode('utf-8').strip()
    except subprocess.CalledProcessError as e:
        # Fallback filename if yt-dlp fails to get name (e.g. auth issue caught here)
        logging.warning(f"Could not determine filename, using default: {e}")
        filename = f"video_{video_url.split('=')[-1]}.mp4"

    logging.info(f"Streaming: {filename}")

    cmd_download = ["yt-dlp", "-f", quality, "-o", "-", "--js-runtimes", "node", "--extractor-args", "youtube:player_client=ios"]
    if cookies_file:
        cmd_download.extend(["--cookies", cookies_file])
    cmd_download.append(video_url)
    
    process = subprocess.Popen(
        cmd_download,
        stdout=subprocess.PIPE,
        stderr=sys.stderr,
        bufsize=10**7
    )
    
    file_metadata = {'name': filename}
    media = MediaIoBaseUpload(process.stdout, mimetype='video/mp4', resumable=False)
    
    file = drive_service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id'
    ).execute()
    
    process.wait()
    
    if process.returncode != 0:
        raise Exception("yt-dlp download/stream process failed")
        
    return file.get('id')

def main():
    job_id = os.environ.get("JOB_ID")
    logging.info(f"Starting worker for Job ID: {job_id}")
    try:
        version = subprocess.check_output(["yt-dlp", "--version"]).decode("utf-8").strip()
        logging.info(f"yt-dlp version: {version}")
        node_version = subprocess.check_output(["node", "--version"]).decode("utf-8").strip()
        logging.info(f"node version: {node_version}")
    except Exception as e:
        logging.warning(f"Metadata check failed: {e}")
    
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
        
        # 1. Get items (handles playlist vs single video)
        video_items = get_video_items(job['youtube_url'], cookies_file)
        
        if not video_items:
            raise Exception("No videos found. Check URL or Privacy settings.")
            
        success_count = 0
        errors = []

        logging.info(f"Found {len(video_items)} videos to process.")

        for item in video_items:
            try:
                logging.info(f"Processing: {item['title']}")
                stream_video_to_drive(item['url'], drive_service, job.get('quality', 'best'), cookies_file)
                success_count += 1
            except Exception as e:
                logging.error(f"Failed to process {item['title']}: {e}")
                errors.append(f"{item['title']}: {str(e)}")
        
        if success_count == 0 and errors:
            raise Exception(f"All downloads failed. Errors: {'; '.join(errors)}")
        
        status = "completed" if not errors else "completed_with_errors"
        update_job_status(db, job['_id'], status)
        
        if cookies_file and os.path.exists(cookies_file):
            os.remove(cookies_file)

    except Exception as e:
        logging.error(f"Fatal error: {e}")
        update_job_status(db, job['_id'], "failed", error=e)
        sys.exit(1)

if __name__ == "__main__":
    main()
