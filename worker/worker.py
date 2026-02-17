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
    # Ensure compatible connection string if needed, mostly ready for Atlas
    client = MongoClient(start_uri)
    return client.utube2drive

def get_job(db, job_id):
    try:
        if not job_id:
             # If no specific job, pick the oldest pending one
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
        None, # No access token initially
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=['https://www.googleapis.com/auth/drive.file']
    )
    return build('drive', 'v3', credentials=creds)

def stream_video_to_drive(youtube_url, drive_service, quality='best'):
    # Get video info first to get clean filename
    cmd_info = [
        "yt-dlp", "--get-filename", "-o", "%(title)s.%(ext)s", youtube_url
    ]
    filename = subprocess.check_output(cmd_info).decode('utf-8').strip()
    logging.info(f"Target filename: {filename}")

    # Create a pipe
    # We will use yt-dlp to output to stdout, and read it into a Custom Stream class
    # that implements read() for the Google Drive uploader
    
    # Start yt-dlp process
    cmd_download = [
        "yt-dlp", "-f", quality, "-o", "-", youtube_url
    ]
    
    process = subprocess.Popen(
        cmd_download,
        stdout=subprocess.PIPE,
        stderr=sys.stderr, # Send yt-dlp logs to stderr so we see them in Action logs
        bufsize=10**7 # 10MB buffer
    )
    
    file_metadata = {'name': filename}
    
    # MediaIoBaseUpload requires a readable stream. 
    # process.stdout is a readable stream.
    media = MediaIoBaseUpload(process.stdout, mimetype='video/mp4', resumable=True)
    
    # Execute upload
    file = drive_service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id'
    ).execute()
    
    # Ensure process finishes
    process.wait()
    
    if process.returncode != 0:
        raise Exception("yt-dlp failed to download video")
        
    return file.get('id')

def main():
    job_id = os.environ.get("JOB_ID")
    logging.info(f"Starting worker for Job ID: {job_id}")
    
    db = get_db()
    
    job = get_job(db, job_id)
    if not job:
        logging.info("No pending jobs found.")
        return

    logging.info(f"Processing job {job['_id']} for {job['youtube_url']}")
    update_job_status(db, job['_id'], "processing")

    try:
        CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
        CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
        
        if not CLIENT_ID or not CLIENT_SECRET:
             raise Exception("Missing Google Credentials in Env")

        drive_service = get_drive_service(job['user_refresh_token'], CLIENT_ID, CLIENT_SECRET)
        
        file_id = stream_video_to_drive(job['youtube_url'], drive_service, job.get('quality', 'best'))
        
        logging.info(f"Upload complete. File ID: {file_id}")
        update_job_status(db, job['_id'], "completed")

    except Exception as e:
        logging.error(f"Fatal error: {e}")
        update_job_status(db, job['_id'], "failed", error=e)
        sys.exit(1)

if __name__ == "__main__":
    main()
