from pathlib import Path
from threading import BoundedSemaphore
from typing import Dict, List, Union

import cv2
from fastapi import HTTPException, UploadFile

from app.core import config, utils

MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024  # 5 GB
MAX_CONCURRENT_EXTRACTIONS = 2

_extract_semaphore = BoundedSemaphore(MAX_CONCURRENT_EXTRACTIONS)


def ensure_session_dirs(session_id: str) -> None:
    (config.VIDEOS_DIR / session_id).mkdir(parents=True, exist_ok=True)
    (config.FRAMES_DIR / session_id).mkdir(parents=True, exist_ok=True)
    (config.CROPS_DIR / session_id).mkdir(parents=True, exist_ok=True)


def _status_path(session_id: str) -> Path:
    return config.FRAMES_DIR / session_id / "status.json"


def _write_status(
    session_id: str,
    status: str,
    total_frames: int = 0,
    processed_frames: int = 0,
    message: str = "",
) -> None:
    payload = {
        "status": status,
        "total_frames": total_frames,
        "processed_frames": processed_frames,
        "message": message,
    }
    utils.write_json(_status_path(session_id), payload)


def _read_status(session_id: str) -> Dict[str, Union[int, str]]:
    fallback = {"status": "pending", "processed_frames": 0, "total_frames": 0, "message": ""}
    data = utils.read_json(_status_path(session_id)) or {}
    return {
        "status": data.get("status", fallback["status"]),
        "processed_frames": data.get("processed_frames", fallback["processed_frames"]),
        "total_frames": data.get("total_frames", fallback["total_frames"]),
        "message": data.get("message", fallback["message"]),
    }


def create_session(fps: int) -> str:
    config.ensure_data_dirs()
    session_id = utils.generate_session_id()
    ensure_session_dirs(session_id)
    _write_status(session_id, status="pending", total_frames=0, processed_frames=0)
    return session_id


async def store_video(file: UploadFile, session_id: str) -> Path:
    ensure_session_dirs(session_id)

    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()

    if not filename.endswith(".mp4") and not content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="仅支持视频文件，请选择 mp4 或其他视频格式")

    destination = config.VIDEOS_DIR / session_id / "raw.mp4"
    size = 0
    try:
        with destination.open("wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise HTTPException(status_code=413, detail="文件过大，超过 5GB 限制")
                buffer.write(chunk)
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return destination


def extract_frames(session_id: str, fps: int) -> List[str]:
    """
    抽帧并保存到 frames/{session_id}/，返回生成的文件名列表。
    基于 OpenCV 实现，同步执行。若后续接入任务队列，可将本函数包装为异步任务。
    """
    if fps <= 0:
        raise HTTPException(status_code=400, detail="fps 必须为正整数")

    video_path = config.VIDEOS_DIR / session_id / "raw.mp4"
    frames_dir = config.FRAMES_DIR / session_id
    frames_dir.mkdir(parents=True, exist_ok=True)

    if not video_path.exists():
        raise HTTPException(status_code=404, detail="未找到上传的视频文件")

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise HTTPException(status_code=500, detail="无法打开视频文件")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    video_fps = cap.get(cv2.CAP_PROP_FPS) or 0
    frame_interval = max(1, int(round(video_fps / fps))) if video_fps > 0 else 1

    # 控制并发：如超出上限，则标记排队并等待
    acquired = _extract_semaphore.acquire(blocking=False)
    if not acquired:
        _write_status(session_id, status="queued", total_frames=total_frames, processed_frames=0, message="等待抽帧资源")
        _extract_semaphore.acquire()

    _write_status(session_id, status="processing", total_frames=total_frames, processed_frames=0, message="")

    saved_files: List[str] = []
    frame_idx = 0
    processed = 0

    try:
        while True:
            success, frame = cap.read()
            if not success:
                break

            if frame_idx % frame_interval == 0:
                frame_to_save = frame
                if config.FRAME_RESIZE_TO:
                    frame_to_save = cv2.resize(frame, config.FRAME_RESIZE_TO)

                file_name = f"{config.FRAME_PREFIX}{len(saved_files)+1:05d}.jpg"
                output_path = frames_dir / file_name

                imwrite_params = []
                if config.FRAME_JPEG_QUALITY:
                    imwrite_params = [int(cv2.IMWRITE_JPEG_QUALITY), int(config.FRAME_JPEG_QUALITY)]

                cv2.imwrite(str(output_path), frame_to_save, imwrite_params)
                saved_files.append(file_name)

            frame_idx += 1
            processed = frame_idx

            # 避免频繁写文件，仅在每 30 帧或结束时更新进度
            if processed % 30 == 0:
                _write_status(session_id, status="processing", total_frames=total_frames, processed_frames=processed)

    except Exception as exc:  # noqa: BLE001
        _write_status(
            session_id,
            status="error",
            total_frames=total_frames,
            processed_frames=processed,
            message=str(exc),
        )
        raise
    finally:
        cap.release()
        _extract_semaphore.release()

    _write_status(session_id, status="done", total_frames=total_frames, processed_frames=processed)
    return saved_files


def get_status(session_id: str):
    return _read_status(session_id)


def list_frames(session_id: str) -> List[str]:
    frames_dir = config.FRAMES_DIR / session_id
    if not frames_dir.exists():
        return []
    return sorted([p.name for p in frames_dir.glob("*.jpg")])


def get_frame_path(session_id: str, frame_name: str) -> Path:
    return config.FRAMES_DIR / session_id / frame_name


def cleanup_session(session_id: str) -> None:
    """Remove all artifacts of a session."""
    for path in [
        config.VIDEOS_DIR / session_id,
        config.FRAMES_DIR / session_id,
        config.CROPS_DIR / session_id,
    ]:
        if path.exists():
            for item in path.glob("**/*"):
                if item.is_file():
                    item.unlink(missing_ok=True)
            # remove empty dirs from bottom up
            for dirpath in sorted([p for p in path.glob("**/*") if p.is_dir()], reverse=True):
                dirpath.rmdir()
            path.rmdir()
    labels_file = config.LABELS_DIR / f"{session_id}.json"
    export_file = config.LABELS_DIR / f"{session_id}{config.EXPORT_SUFFIX}"
    labels_file.unlink(missing_ok=True)
    export_file.unlink(missing_ok=True)
