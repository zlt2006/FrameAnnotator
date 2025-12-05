from pathlib import Path
import asyncio
from typing import List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.services import label_service, video_service

router = APIRouter()


@router.post("/upload")
async def upload_video(file: UploadFile = File(...), fps: int = Form(...)):
    session_id = video_service.create_session(fps=fps)
    await video_service.store_video(file=file, session_id=session_id)

    async def run_extraction():
        frames: List[str] = await asyncio.to_thread(video_service.extract_frames, session_id=session_id, fps=fps)
        label_service.initialize_session(session_id=session_id, fps=fps, frames=frames)

    asyncio.create_task(run_extraction())

    return {"session_id": session_id, "message": "video uploaded, extracting frames"}


@router.get("/{session_id}/status")
def get_status(session_id: str):
    return video_service.get_status(session_id=session_id)


@router.get("/{session_id}/frames")
def list_frames(session_id: str):
    frames = video_service.list_frames(session_id=session_id)
    return {"frames": frames}


@router.get("/{session_id}/frames/{frame_name}")
def fetch_frame(session_id: str, frame_name: str):
    frame_path: Path = video_service.get_frame_path(session_id=session_id, frame_name=frame_name)
    if not frame_path.exists():
        raise HTTPException(status_code=404, detail="Frame not found")
    return FileResponse(frame_path, media_type="image/jpeg")


@router.delete("/{session_id}")
def cleanup(session_id: str):
    video_service.cleanup_session(session_id=session_id)
    return {"success": True}
