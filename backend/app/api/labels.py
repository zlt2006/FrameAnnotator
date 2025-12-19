from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.services import label_service

router = APIRouter()


class BBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class LabelRequest(BaseModel):
    bbox: BBox
    label: int
    hand_label: Optional[int] = None


class Detection(BaseModel):
    x: float
    y: float
    box_size: float
    image_width: float
    image_height: float


class DetectionRequest(BaseModel):
    detections: list[Detection]
    saved: Optional[bool] = False


@router.post("/labels/{session_id}/frame/{frame_name}")
def submit_label(session_id: str, frame_name: str, payload: LabelRequest):
    result = label_service.save_label(
        session_id=session_id,
        frame_name=frame_name,
        bbox=payload.bbox.model_dump(),
        label=payload.label,
        hand_label=payload.hand_label,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Frame not found in label set")
    return result


@router.get("/labels/{session_id}")
def get_labels(session_id: str):
    summary = label_service.get_summary(session_id=session_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return summary


@router.post("/export/{session_id}")
def export_dataset(session_id: str):
    export_path = label_service.export_dataset(session_id=session_id)
    if export_path is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "download_url": f"/api/export/{session_id}/download"}


@router.get("/export/{session_id}/download")
def download_export(session_id: str):
    export_path: Optional[Path] = label_service.get_export_path(session_id=session_id)
    if export_path is None or not export_path.exists():
        raise HTTPException(status_code=404, detail="Export not found")
    return FileResponse(export_path, media_type="application/zip")


@router.post("/labels/{session_id}/reset")
def reset_labels(session_id: str):
    ok = label_service.reset_labels(session_id=session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True}


@router.post("/labels/{session_id}/frame/{frame_name}/detections")
def save_detections(session_id: str, frame_name: str, payload: DetectionRequest):
    result = label_service.save_detections(
        session_id=session_id, frame_name=frame_name, detections=payload.detections, saved=payload.saved or False
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@router.post("/export/detections/{session_id}")
def export_detections(session_id: str):
    export_path = label_service.export_detections(session_id=session_id)
    if export_path is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "download_url": f"/api/export/detections/{session_id}/download"}


@router.get("/export/detections/{session_id}/download")
def download_detection_export(session_id: str):
    export_path = label_service.export_detections(session_id=session_id)
    if export_path is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not export_path.exists():
        export_path = label_service.export_detections(session_id=session_id)
    if export_path is None or not export_path.exists():
        raise HTTPException(status_code=404, detail="Export not found")
    return FileResponse(export_path, media_type="application/zip")
